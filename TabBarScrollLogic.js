const NONE = 0;
const LEFT = -1;
const RIGHT = 1;

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
  position: {
    current: 0,
    reference: 0,
    next: null,
  },
  offset: {
    current: 0,
    reference: 0,
    referenceInterpolated: 0,
    next: 0,
    toNext: {
      current: 0,
      currentDirection: 1,
      reference: 0,
    },
  },
  ignored: false,

  onPageUpdate(page) {
    this.position.next = page;
    this.offset.next = this.calculateOffset(Math.floor(page), page % 1);

    this.offset.toNext.currentDirection = this.offset.next - this.offset.current;
    this.offset.toNext.currentDirection /= Math.abs(this.offset.toNext.currentDirection);

    // If current is after next, the result will be negative and the movement will be to the
    // left, otherwise the result will be positive and the movement will be to the right
    this.offset.toNext.current = this.offset.current - this.offset.next;
    this.offset.toNext.reference = Math.abs(this.offset.reference - this.offset.next);

    if (this.isNextAtMiddle()) {
      this.offset.referenceInterpolated = this.offset.reference;

      console.log('PAGE', {
        position: JSON.stringify(this.position),
        offset: JSON.stringify(this.offset),
        ratio: this.ratio,
        isNextAtMiddle: true,
        isCurrentAtMiddle: this.isCurrentAtMiddle(),
      });
    } else {
      console.log('PAGE', {
        position_next: page,
        ratio: this.ratio,
        isNextAtMiddle: false,
        isCurrentAtMiddle: this.isCurrentAtMiddle(),
      });
    }

    this.props.goToPage(page);
  },

  /**
   * Returns true if the current position is between the reference content position and the next
   * position.
   */
  isCurrentAtMiddle() {
    return (this.position.reference < this.position.current && this.position.current < this.position.next)
      || (this.position.next < this.position.current && this.position.current < this.position.reference);
  },

  isNextAtMiddle() {
    return (this.position.reference < this.position.next && this.position.next < this.position.current)
      || (this.position.current < this.position.next && this.position.next < this.position.reference);
  },

  isCurrentAtNext() {
    return this.position.current === this.position.next
      || Math.abs(this.offset.current - this.offset.next) < 0.1;
  },

  updateView({ value }) {
    const intPosition = Math.floor(value);
    const tabCount = this.props.tabs.length;
    const referenceTabPosition = tabCount - 1;

    if (tabCount === 0 || value < 0 || value > referenceTabPosition) {
      return;
    }

    this.position.reference = value;

    if (this.necessarilyMeasurementsCompleted(intPosition, intPosition === referenceTabPosition)) {
      const pageOffset = value % 1;

      console.log('UPDATE', {
        position: JSON.stringify(this.position),
        offset: JSON.stringify(this.offset),
        ratio: this.ratio,
        isNextAtMiddle: this.isNextAtMiddle(),
        isCurrentAtMiddle: this.isCurrentAtMiddle(),
      });

      // If the next position is at middle, the movement is opposit so needs to be interpolated
      const nextAtMiddle = this.isNextAtMiddle();

      // Do not move if the current position is not at middle
      // This is done because the reference position is going towards the current, so if we wait it
      // to be reached, the back and foward movement will be avoided
      // When this happen, the next steps will make this condition true and the movement will be
      // made
      if (nextAtMiddle || (!this.isCurrentAtMiddle() && !this.isCurrentAtNext())) {
        this.updateTabPanel(intPosition, pageOffset, nextAtMiddle);
      } else {
        this.offset.reference = this.offset.current;
      }

      // this.updateTabUnderline(intPosition, pageOffset, tabCount);
    }
  },

  updateCurrentOffset(event) {
    const offset = event.nativeEvent.contentOffset.x;
    if (offset < 0) {
      return;
    }

    const position = Math.floor(this.position.current);
    const tab = this._tabsMeasurements[position];

    if (tab) {
      // The movement is to the left
      if (offset < this.offset.current) {
        // If this is still after the current tab left, it's for sure still in the current tab, so
        // just the page offset may be changed
        if (tab.left <= offset) {
          this.position.current = position + (offset - tab.left) / tab.width;
        // Otherwise it is before the current tab
        } else {
          this.position.current = this.findPositionReversed(offset, 0, position - 1);
        }
      // The movement is to the right
      } else if (this.offset.current < offset) {
        // If this is still before the next tab, it's for sure still in the current tab, so just the
        // page offset may be changed
        if (offset < tab.left + tab.width) {
          this.position.current = position + (offset - tab.left) / tab.width;
        // Otherwise it is after the current tab
        } else {
          this.position.current = this.findPosition(offset, position + 1);
        }
      }
    }

    this.offset.current = offset;

    console.log('SCROLL', {
      offset: this.offset.current,
      position: this.position.current,
      isNextAtMiddle: this.isNextAtMiddle(),
      isCurrentAtMiddle: this.isCurrentAtMiddle(),
    });
  },

  findPosition(offset, start = 0, end) {
    if (end === undefined) {
      return this.findPosition(offset, start, this._tabsMeasurements.length);
    }

    for (let i = start; i < end; i += 1) {
      const tab = this._tabsMeasurements[i];

      if (tab) {
        const rightIndex = i + 1;
        const right = rightIndex < this._tabsMeasurements.length && this._tabsMeasurements[rightIndex]
          ? this._tabsMeasurements[rightIndex].left : this._containerMeasurements.width;
  
        if (tab && offset < right) {
          return i + (offset - tab.left) / tab.width;
        }
      }
    }

    return this._tabsMeasurements.length - 1;
  },

  findPositionReversed(offset, start = 0, end) {
    if (end === undefined) {
      return this.findPositionReversed(offset, start, this._tabsMeasurements.length - 1);
    }

    for (let i = end; i >= start; i -= 1) {
      const tab = this._tabsMeasurements[i];

      if (tab && tab.left <= offset) {
        return i + (offset - tab.left) / tab.width;
      }
    }

    return 0;
  },

  calculateOffset(position, pageOffset, nextAtMiddle) {
    const containerWidth = this._containerMeasurements.width;
    const { left: tabOffset, width: tabWidth } = this._tabsMeasurements[position];
    const nextTabMeasurements = this._tabsMeasurements[position + 1];
    const nextTabWidth = nextTabMeasurements && nextTabMeasurements.width || 0;

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
    // The toNext.current value has the direction
    const current = this.offset.toNext.current * referenceRatio;

    const interpolated = this.offset.next + current;
    
    console.log('INTERPOLATION', {
      referenceOffset: offset,
      referenceMissing: this.offset.next - offset,
      offset: JSON.stringify(this.offset),
      referenceRatio,
      current,
      interpolated,
    });
    
    return applyBoundaries(interpolated, 0, rightBoundScroll);
  },

  updateTabPanel(position, pageOffset, nextAtMiddle) {
    const offset = this.calculateOffset(position, pageOffset);

    // True means the distance is getting smaller, so the movement is correct
    const sameDirection = Math.abs(this.offset.next - offset) < Math.abs(this.offset.next - this.offset.reference);

    if (nextAtMiddle) {
      const interpolated = this.interpolateOffset(offset);

      console.log('NEXT AT MIDDLE', { from: offset, to: interpolated });

      this.offset.ignored = (
        !this.offset.ignored && !sameDirection && Math.abs(this.offset.referenceInterpolated - interpolated) >= 100
      ) || Math.abs(this.position.current - this.position.referenceInterpolated) <= 0.001;
      
      if (!this.offset.ignored) {
        console.log('UPDATE MOVE', { offset: interpolated, position, pageOffset });
        this._scrollView.getNode().scrollTo({ x: interpolated, y: 0, animated: false });
      } else {
        console.log('UPDATE IGNORED', { offset, position, pageOffset });
      }

      this.offset.referenceInterpolated = interpolated;
    } else {
      this.offset.ignored = (
        !this.offset.ignored && !sameDirection && Math.abs(this.offset.reference - offset) >= 100
      ) || Math.abs(this.position.current - this.position.reference) <= 0.001;
      
      if (!this.offset.ignored) {
        console.log('UPDATE MOVE', { offset, position, pageOffset });
        this._scrollView.getNode().scrollTo({ x: offset, y: 0, animated: false });
      } else {
        console.log('UPDATE IGNORED', { offset, position, pageOffset });
      }
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

      // console.log('UNDERLINE', lineLeft, newLineLeft);
      
      this.state._leftTabUnderline.setValue(newLineLeft);
      this.state._widthTabUnderline.setValue(newLineRight - newLineLeft);
    } else {
      // console.log('UNDERLINE STILL?', lineLeft);

      this.state._leftTabUnderline.setValue(lineLeft);
      this.state._widthTabUnderline.setValue(lineRight - lineLeft);
    }
  },
};
