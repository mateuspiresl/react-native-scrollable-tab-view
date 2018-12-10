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
  isPagePress: false,
  nextEvent: null,
  referencePosition: 0,
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
    this.isPagePress = true;
    this.offset.referenceInterpolated = this.offset.reference;
    this.offset.next = this.calculateOffset(Math.floor(page), page % 1);
    this.offset.toNext.currentDirection = this.offset.next - this.offset.current;
    this.offset.toNext.currentDirection /= Math.abs(this.offset.toNext.currentDirection);
    // If current is after next, the result will be negative and the movement will be to the
    // left, otherwise the result will be positive and the movement will be to the right
    this.offset.toNext.current = this.offset.current - this.offset.next;
    this.offset.toNext.reference = Math.abs(this.offset.reference - this.offset.next);

    // console.log('PAGE', {
    //   position: this.referencePosition,
    //   offset: JSON.stringify(this.offset),
    //   isNextAtMiddle: this.isNextAtMiddle(),
    //   isCurrentAtMiddle: this.isCurrentAtMiddle(),
    // });

    this.props.goToPage(page);
  },

  /**
   * Returns true if the current position is between the reference content position and the next
   * position.
   */
  isCurrentAtMiddle(offset) {
    return (offset < this.offset.current && this.offset.current < this.offset.next)
      || (this.offset.next < this.offset.current && this.offset.current < offset);
  },

  isNextAtMiddle(offset) {
    return (offset < this.offset.next && this.offset.next < this.offset.current)
      || (this.offset.current < this.offset.next && this.offset.next < offset);
  },

  isCurrentAtNext() {
    return Math.abs(this.offset.current - this.offset.next) < 0.1;
  },

  isReferenceAtNext(offset) {
    return Math.abs(offset - this.offset.next) < 0.1;
  },

  enableNextEvent() {
    if (this.nextEvent) {
      clearTimeout(this.nextEvent);
    } else {
      // console.log('SETTING NEXT EVENT');
    }

    this.nextEvent = setTimeout(this.nextEventTimeout.bind(this), 50);
  },

  nextEventTimeout() {
    this.isPagePress = false;
    this.nextEvent = null;
    // console.log('NEXT EVENT TIMEOUT');
  },

  updateView({ value }) {
    const intPosition = Math.floor(value);
    const tabCount = this.props.tabs.length;
    const lastTabPosition = tabCount - 1;

    if (tabCount === 0 || value < 0 || value > lastTabPosition) {
      return;
    }

    // Sometimes, the next position it receives is the old one plus/minus 1, but the next one that
    // comes has a small difference (less than 1) to the old one, as expected
    // As there is no reason for this to happen, this is considered a bug in the ScrollView and is
    // ignored below
    if (Math.abs(value - this.referencePosition) === 1) {
      // console.log('BUGGY MOVEMENT IGNORED', this.referencePosition, value);
      return;
    }

    if (this.isPagePress) {
      this.enableNextEvent();
    }

    if (this.necessarilyMeasurementsCompleted(intPosition, intPosition === lastTabPosition)) {
      const pageOffset = value % 1;
      const offset = this.calculateOffset(intPosition, pageOffset);

      // If the next position is at middle, the movement is opposit so needs to be interpolated
      const nextAtMiddle = this.isNextAtMiddle(offset);
      
      // console.log('UPDATE', {
      //   IS_PAGE_PRESS: this.isPagePress,
      //   OFFSET: offset,
      //   old_position: this.referencePosition,
      //   new_position: value,
      //   position: this.referencePosition,
      //   offset: this.offset,
      //   isNextAtMiddle: nextAtMiddle,
      //   isCurrentAtMiddle: this.isCurrentAtMiddle(offset),
      //   isCurrentAtNext: this.isCurrentAtNext(),
      // })

      // Do not move if the current position is not at middle
      // This is done because the reference position is going towards the current, so if we wait it
      // to be reached, the back and foward movement will be avoided
      // When this happen, the next steps will make this condition true and the movement will be
      // made
      if (!this.isPagePress || (!this.isCurrentAtNext() && (nextAtMiddle || !this.isCurrentAtMiddle(offset)))) {
        this.updateTabPanel(offset, intPosition, pageOffset, this.isPagePress && nextAtMiddle);
      } else {
        this.offset.reference = this.offset.current;
      }

      this.updateTabUnderline(intPosition, pageOffset, tabCount);
    }

    this.referencePosition = value;
  },

  updateCurrentOffset(offset) {
    if (offset >= 0) {
      this.offset.current = offset;
    }
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
    
    // console.log('INTERPOLATION', {
    //   IS_PAGE_PRESS: this.isPagePress,
    //   referenceOffset: offset,
    //   referenceMissing: this.offset.next - offset,
    //   offset: JSON.stringify(this.offset),
    //   referenceRatio,
    //   current,
    //   interpolated,
    // });
    
    return applyBoundaries(interpolated, 0, rightBoundScroll);
  },

  updateTabPanel(offset, position, pageOffset, nextAtMiddle) {
    // True means the distance is getting smaller, so the movement is correct
    const sameDirection = Math.abs(this.offset.next - offset) < Math.abs(this.offset.next - this.offset.reference);

    if (nextAtMiddle) {
      const interpolated = this.interpolateOffset(offset);
      const hasBuggyMovement = Math.abs(this.offset.referenceInterpolated - interpolated) >= 100;

      this.updateCurrentOffset((this.offset.current + interpolated) / 2);

      this.offset.reference = offset;
      this.offset.referenceInterpolated = interpolated;
      // TODO Needs improment
      this.offset.ignored = !this.offset.ignored && !sameDirection && hasBuggyMovement;
      
      if (!this.offset.ignored) {
        this._scrollView.getNode().scrollTo({ x: interpolated, y: 0, animated: false });
      }

      console.log('UPDATE NEXT AT MIDDLE', {
        IS_PAGE_PRESS: this.isPagePress,
        ignored: this.offset.ignored,
        position,
        pageOffset,
        offset,
        interpolated,
        currentOffset: this.offset.current,
      });
    } else {
      const hasBuggyMovement = Math.abs(this.offset.reference - offset) >= 100;

      this.updateCurrentOffset((this.offset.current + offset) / 2);

      this.offset.reference = offset;
      this.offset.ignored = !this.offset.ignored && !sameDirection && hasBuggyMovement;

      if (!this.offset.ignored) {
        this._scrollView.getNode().scrollTo({ x: offset, y: 0, animated: false });
      }
      
      // console.log('UPDATE', this.offset.ignored ? 'IGNORED' : 'MOVE', {
      //   IS_PAGE_PRESS: this.isPagePress,
      //   offset,
      //   position,
      //   pageOffset,
      // });
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

      // // console.log('UNDERLINE', lineLeft, newLineLeft);
      
      this.state._leftTabUnderline.setValue(newLineLeft);
      this.state._widthTabUnderline.setValue(newLineRight - newLineLeft);
    } else {
      // // console.log('UNDERLINE STILL?', lineLeft);

      this.state._leftTabUnderline.setValue(lineLeft);
      this.state._widthTabUnderline.setValue(lineRight - lineLeft);
    }
  },
};
