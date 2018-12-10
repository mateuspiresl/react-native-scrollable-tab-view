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
  isPagePress: false,
  pagePressEvent: null,
  referencePosition: 0,
  offset: {
    current: 0,
    reference: 0,
    next: 0,
    toNext: {
      current: 0,
      reference: 0,
    },
  },
  ignored: false,

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
      // no reason for this to happen, this is considered a bug in the ScrollView and is ignored
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
      const offset = this.calculateOffset(intPosition, pageOffset);

      // If the next position is at middle, the movement is opposit so needs to be interpolated
      const nextAtMiddle = this.isNextAtMiddle(offset);

      // Do not move if the current position is not at middle
      // This is done because the reference position is going towards the current, so if we wait it
      // to be reached, the back and foward movement will be avoided
      // When this happen, the next steps will make this condition true and the movement will be
      // made
      if (!this.isPagePress || (!this.isCurrentAtNext() && (nextAtMiddle || !this.isCurrentAtMiddle(offset)))) {
        this.updateTabPanel(offset, this.isPagePress && nextAtMiddle);
      } else {
        this.offset.reference = this.offset.current;
      }

      this.updateTabUnderline(intPosition, pageOffset, tabCount);
    }

    this.referencePosition = value;
  },

  updateCurrentOffset(offset) {
    this.offset.current = Math.max(offset, 0);
  },

  calculateOffset(position, pageOffset) {
    const containerWidth = this._containerMeasurements.width;
    const { left: tabOffset, width: tabWidth } = this._tabsMeasurements[position];
    const nextTabMeasurements = this._tabsMeasurements[position + 1];
    const nextTabWidth = nextTabMeasurements ? nextTabMeasurements.width : 0;

    const absolutePageOffset = pageOffset * tabWidth;
    const rightBoundScroll = this._tabContainerMeasurements.width - this._containerMeasurements.width;
    // Center tab and smooth tab change (for when tabWidth changes a lot between two tabs)
    const centering = (containerWidth - (1 - pageOffset) * tabWidth - pageOffset * nextTabWidth) / 2;
    const offset = tabOffset + absolutePageOffset - centering;

    return applyBoundaries(offset, 0, rightBoundScroll);
  },

  interpolateOffset(offset) {
    const rightBoundScroll = this._tabContainerMeasurements.width - this._containerMeasurements.width;

    // Reference portion that is missing to arrive at next
    const referenceRatio = Math.abs((this.offset.next - offset) / this.offset.toNext.reference);
    // Current portion that is missing to arrive at next
    const current = this.offset.toNext.current * referenceRatio;
    // The current value has the direction
    const interpolated = this.offset.next + current;

    return applyBoundaries(interpolated, 0, rightBoundScroll);
  },

  move(offset) {
    this.updateCurrentOffset((this.offset.current + offset) / 2);

    if (!this.offset.ignored) {
      this._scrollView.getNode().scrollTo({ x: offset, y: 0, animated: false });
    }
  },

  updateTabPanel(offset, nextAtMiddle) {
    this.offset.ignored = !this.offset.ignored
      // The distance is getting bigger, so the movement should be ignored
      && Math.abs(this.offset.next - offset) >= Math.abs(this.offset.next - this.offset.reference);

    if (nextAtMiddle) {
      this.move(this.interpolateOffset(offset));
    } else {
      this.move(offset);
    }

    this.offset.reference = offset;
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
