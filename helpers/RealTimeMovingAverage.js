/**
 * Real-time moving average calculator for blood flow signals
 */
export default class RealTimeMovingAverage {
    constructor(windowSize) {
      this.windowSize = Math.max(1, Math.trunc(windowSize));
      this.values = new Array(this.windowSize);
      this.count = 0;
      this.writeIndex = 0;
      this.sum = 0;
      this.currentAverage = 0;
    }
  
    /**
     * Add a new data point and update the average
     * @param {number} newValue - The newest blood flow measurement
     * @return {number} - The updated average flow
     */
    addValue(newValue) {
      if (this.count < this.windowSize) {
        this.values[this.writeIndex] = newValue;
        this.sum += newValue;
        this.count += 1;
      } else {
        const oldestValue = this.values[this.writeIndex];
        this.values[this.writeIndex] = newValue;
        this.sum += newValue - oldestValue;
      }

      this.writeIndex = (this.writeIndex + 1) % this.windowSize;
      
      // Calculate the current average
      this.currentAverage = this.sum / this.count;
      return this.currentAverage;
    }
    
    /**
     * Get the current average without adding a new value
     * @return {number} - The current average flow
     */
    getCurrentAverage() {
      return this.currentAverage;
    }
    
    /**
     * Reset the moving average calculator
     */
    reset() {
      this.values = new Array(this.windowSize);
      this.count = 0;
      this.writeIndex = 0;
      this.sum = 0;
      this.currentAverage = 0;
    }
  }