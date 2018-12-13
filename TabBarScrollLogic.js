function applyBoundaries(value, min, max) {
  if (value <= min) {
    return min;
  }

  if (value >= max) {
    return max;
  }

  return value;
}

module.exports = {
  // True when the movement belongs to a tab press
  isPagePress: false,
  // Event that turns off the page press flag
  pagePressEvent: null,
  // The reference position of the content (pages) scroller
  referencePosition: 0,
  offset: {
    // The current offset of the tab bar scroller
    // This one consider the swip movement of the tab bar and is the most update one
    current: 0,
    // The reference offset is calculated from the position of the content (pages) scroller
    reference: 0,
    // The next offset is calculated from the position of the tab selected by a tab press
    // This one needs to be considered in the interpolation movement discussed in the
    // #interpolateOffset method
    next: 0,
    toNext: {
      // Difference between the current offset and next one
      current: 0,
      // Difference between the reference offset and next one
      reference: 0,
    },
  },

  onPageUpdate(page) {
    this.isPagePress = true;
    this.offset.next = this.calculateOffset(Math.floor(page), page % 1);
    // If current is after next, the result will be negative and the movement will be to the
    // left, otherwise the result will be positive and the movement will be to the right
    this.offset.toNext.current = this.offset.current - this.offset.next;
    this.offset.toNext.reference = Math.abs(this.offset.reference - this.offset.next);

    this.props.goToPage(page);
  },

  /**
   * Returns true if the current offset is between the reference content offset and the next
   * offset.
   */
  isCurrentAtMiddle(offset) {
    return (offset < this.offset.current && this.offset.current < this.offset.next)
      || (this.offset.next < this.offset.current && this.offset.current < offset);
  },

  /**
   * Returns true if the next offset is between the reference and the current one.
  */
  isNextAtMiddle(offset) {
    return (offset < this.offset.next && this.offset.next < this.offset.current)
      || (this.offset.current < this.offset.next && this.offset.next < offset);
  },

  /**
   * Returns true if the current offset is at the same place of the next.
   */
  isCurrentAtNext() {
    return Math.abs(this.offset.current - this.offset.next) < 0.1;
  },

  /**
   * Keeps the page press flag for more 50 ms.
   */
  keepPagePress() {
    if (this.pagePressEvent) {
      clearTimeout(this.pagePressEvent);
    }

    // TODO Find the best time
    this.pagePressEvent = setTimeout(this.onPagePressTimeout.bind(this), 50);
  },

  /**
   * Callback for page press timeout.
   */
  onPagePressTimeout() {
    this.isPagePress = false;
    this.pagePressEvent = null;
  },

  updateView({ value }) {
    const intPosition = Math.floor(value);
    const tabCount = this.props.tabs.length;
    const lastTabPosition = tabCount - 1;

    if (tabCount === 0 || value < 0 || value > lastTabPosition
      // Sometimes, the next position it receives is the old one plus/minus 1, but the next one
      // that comes has a small difference (less than 1) to the old one, as expected. As there is
      // no reason for this to happen, this is considered a bug somewhere outside and is ignored
      // below
      || Math.abs(value - this.referencePosition) === 1
    ) {
      return;
    }

    if (this.isPagePress) {
      this.keepPagePress();
    }

    if (this.necessarilyMeasurementsCompleted(intPosition, intPosition === lastTabPosition)) {
      const pageOffset = value % 1;

      this.updateTabPanel(intPosition, pageOffset);
      this.updateTabUnderline(intPosition, pageOffset, tabCount);
    }

    this.referencePosition = value;
  },

  updateCurrentOffset(offset) {
    this.offset.current = Math.max(offset, 0);
  },

  calculateOffset(position, pageOffset) {
    const { left: tabOffset, width: tabWidth } = this._tabsMeasurements[position];
    const nextTabMeasurements = this._tabsMeasurements[position + 1];
    const nextTabWidth = nextTabMeasurements ? nextTabMeasurements.width : 0;

    const absolutePageOffset = pageOffset * tabWidth;
    // Center tab and smooth tab change (for when tabWidth changes a lot between two tabs)
    const centering = (this._containerMeasurements.width - (1 - pageOffset) * tabWidth - pageOffset * nextTabWidth) / 2;
    const offset = tabOffset + absolutePageOffset - centering;

    return applyBoundaries(offset, 0, this._rightBoundScroll);
  },

  /**
   * Interpolate the offset for cases where the next position in between the current and the
   * reference. It means the reference position is moving towards the next position, but the
   * current position should move in the opposit direction to reach the next position. This method
   * calculates the offset in this opposit direction.
   * @param {Number} offset The real offset calculated from the reference.
   * @returns {Number} The offset for the opposit direction.
   */
  interpolateOffset(offset) {
    // Reference portion that is missing to arrive at next
    const referenceRatio = Math.abs((this.offset.next - offset) / this.offset.toNext.reference);
    // Current portion that is missing to arrive at next
    // It contains the direction that comes from this.offset.toNext.current
    const current = this.offset.toNext.current * referenceRatio;

    return applyBoundaries(this.offset.next + current, 0, this._rightBoundScroll);
  },

  /**
   * Updates the scroll offset and the current offset for later reference.
   * @param {Number} offset The offset to update.
   */
  move(offset) {
    // The current offset is not changed to the offset updated to avoid missing an update that
    // comes before the movement is completely done.
    // Example: considering the current offset is 100 and the new one is 200, if another update
    // happens later and its offset is 180, it will be ignored because it is opposit to the
    // movement. But if the smoothing below happen, the stored offset for the update of 200 will be
    // 150, which is smaller than 180 and won't make this updated get ignored.
    this.updateCurrentOffset((this.offset.current + offset) / 2);
    
    // Note the movement is updated to the actual offset. The smothing above is made just for the
    // current offset reference.
    this._scrollView.getNode().scrollTo({ x: offset, y: 0, animated: false });
  },

  updateTabPanel(position, pageOffset) {
    const offset = this.calculateOffset(position, pageOffset);

    // If the next position is at middle, the movement is opposit so needs to be interpolated
    const nextAtMiddle = this.isNextAtMiddle(offset);

    // Do not move if the current position is not at middle. This is done because the reference
    // position is going towards the current, so if we wait it to be reached, the back and foward
    // movement will be avoided. When this happen, the next steps will make this condition true
    // and the movement will be made
    if (!this.isPagePress || (!this.isCurrentAtNext() && (nextAtMiddle || !this.isCurrentAtMiddle(offset)))) {  
      if (this.isPagePress && nextAtMiddle) {
        this.move(this.interpolateOffset(offset));
      } else {
        this.move(offset);
      }
    
      this.offset.reference = offset;
    } else {
      this.offset.reference = this.offset.current;
    }
  },

  updateTabUnderline(position, pageOffset, tabCount) {
    const lineLeft = this._tabsMeasurements[position].left;
    const lineRight = this._tabsMeasurements[position].right;

    if (position < tabCount - 1) {
      const nextTabLeft = this._tabsMeasurements[position + 1].left;
      const nextTabRight = this._tabsMeasurements[position + 1].right;

      const newLineLeft = (pageOffset * nextTabLeft + (1 - pageOffset) * lineLeft);
      const newLineRight = (pageOffset * nextTabRight + (1 - pageOffset) * lineRight);
      
      this.state._leftTabUnderline.setValue(newLineLeft);
      this.state._widthTabUnderline.setValue(newLineRight - newLineLeft);
    } else {
      this.state._leftTabUnderline.setValue(lineLeft);
      this.state._widthTabUnderline.setValue(lineRight - lineLeft);
    }
  },
};
