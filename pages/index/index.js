const STORAGE_KEY = 'dive_logs';

Page({
  data: {
    startDate: '',
    endDate: '',
    diveLocation: '',
    diveCount: 1,
    records: [],
    totalDives: 0,
    recordCount: 0,
    showError: false,
    errorMsg: '',
    
    // 侧滑控制数据
    startX: 0,
    startY: 0
  },

  onLoad() {
    const today = this.getTodayStr();
    let records = [];

    try {
      const stored = wx.getStorageSync(STORAGE_KEY);
      if (stored) {
        records = JSON.parse(stored);
        if (!Array.isArray(records)) records = [];
      }
    } catch (e) {
      console.warn('读取存储失败', e);
      records = [];
    }

    records = records.map(r => {
      let dateRanges = r.dateRanges || [];
      if (!r.dateRanges) {
        if (r.startDate && r.endDate) {
          dateRanges = [{ start: r.startDate, end: r.endDate, count: 1 }];
        } else if (r.date) {
          dateRanges = [{ start: r.date, end: r.date, count: 1 }];
        }
      }

      dateRanges = dateRanges.map(range => ({
        ...range,
        count: range.count || 1 
      }));

      return {
        id: r.id || this.generateId(),
        location: r.location || '未知地点',
        dateRanges: dateRanges,
        diveEntries: this.formatDiveEntries(dateRanges),
        totalCount: this.calcRecordTotal(dateRanges),
        offsetX: 0, 
        isMoving: false
      };
    });

    if (records.length === 0) {
      const sampleRanges = [
        { start: '2026-10-22', end: '2026-11-26', count: 12 },
        { start: '2025-04-05', end: '2025-04-05', count: 2 }
      ];
      records = [
        { 
          id: this.generateId(), 
          location: '菲律宾·图巴塔哈', 
          dateRanges: sampleRanges,
          diveEntries: this.formatDiveEntries(sampleRanges),
          totalCount: this.calcRecordTotal(sampleRanges),
          offsetX: 0,
          isMoving: false
        }
      ];
      this.saveRecords(records);
    }

    this.sortRecords(records);
    this.refreshTotals(records);

    this.setData({
      startDate: today,
      endDate: today,
      records,
      totalDives: this.calcTotalAll(records),
      recordCount: records.length
    });
  },

  // --- 侧滑触摸事件 ---
  touchStart(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      [`records[${index}].isMoving`]: true
    });
  },

  touchMove(e) {
    const index = e.currentTarget.dataset.index;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - this.data.startX;
    const diffY = currentY - this.data.startY;

    // 如果垂直位移大于水平位移，说明是在上下滑动页面，不拦截
    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) return;

    let offsetX = this.data.records[index].offsetX || 0;
    let newOffsetX = offsetX + diffX;

    // 限制范围：不能往右滑出(>0)，左侧最大露出 120px (-120)
    if (newOffsetX > 0) newOffsetX = 0;
    if (newOffsetX < -120) newOffsetX = -120;

    this.setData({
      [`records[${index}].offsetX`]: newOffsetX,
      startX: currentX 
    });
  },

  touchEnd(e) {
    const index = e.currentTarget.dataset.index;
    let currentOffset = this.data.records[index].offsetX || 0;
    
    // 吸附逻辑：滑过一半就完全打开，否则弹回
    let targetOffset = currentOffset < -60 ? -120 : 0;

    this.setData({
      [`records[${index}].offsetX`]: targetOffset,
      [`records[${index}].isMoving`]: false
    });
  },

  // --- 核心业务逻辑 ---
  getTodayStr() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  generateId() {
    return Date.now() + '-' + Math.random().toString(36).substring(2, 10);
  },

  formatDiveEntries(dateRanges) {
    const entries = [];
    dateRanges.forEach(range => {
      const count = range.count || 1;
      if (range.start === range.end) {
        entries.push({ dateStr: this.formatFullDate(range.start), count: count });
      } else {
        const startFormatted = this.formatFullDate(range.start);
        const endFormatted = this.formatShortDate(range.end, range.start);
        
        if (range.start.substring(0, 4) === range.end.substring(0, 4)) {
          entries.push({ dateStr: `${startFormatted}~${endFormatted}`, count: count });
        } else {
          entries.push({ dateStr: `${startFormatted}~${this.formatFullDate(range.end)}`, count: count });
        }
      }
    });
    return entries;
  },

  formatFullDate(dateStr) {
    if (!dateStr) return '';
    return dateStr.replace(/-/g, '.');
  },

  formatShortDate(dateStr, compareStartStr) {
    if (!dateStr) return '';
    const startYear = compareStartStr.substring(0, 4);
    const endYear = dateStr.substring(0, 4);
    if (startYear === endYear) {
      return dateStr.substring(5).replace(/-/g, '.');
    }
    return dateStr.replace(/-/g, '.');
  },

  calcRecordTotal(dateRanges) {
    return dateRanges.reduce((sum, range) => sum + (range.count || 1), 0);
  },

  sortRecords(records) {
    records.sort((a, b) => {
      const getLatestDate = (r) => {
        if (!r.dateRanges || r.dateRanges.length === 0) return '';
        return r.dateRanges.reduce((max, range) => (range.end > max ? range.end : max), '');
      };
      const da = getLatestDate(a);
      const db = getLatestDate(b);
      if (da > db) return -1;
      if (da < db) return 1;
      return 0;
    });
  },

  refreshTotals(records) {
    records.forEach(r => {
      r.totalCount = this.calcRecordTotal(r.dateRanges);
      r.diveEntries = this.formatDiveEntries(r.dateRanges);
    });
  },

  calcTotalAll(records) {
    return records.reduce((sum, r) => sum + (r.totalCount || 0), 0);
  },

  saveRecords(records) {
    try {
      const saveData = records.map(r => ({
        id: r.id,
        location: r.location,
        dateRanges: r.dateRanges
      }));
      wx.setStorageSync(STORAGE_KEY, JSON.stringify(saveData));
    } catch (e) {
      console.warn('保存存储失败', e);
    }
  },

  onStartDateChange(e) {
    const newStart = e.detail.value;
    let newEnd = this.data.endDate;
    if (newEnd && newEnd < newStart) newEnd = newStart;
    this.setData({ startDate: newStart, endDate: newEnd, showError: false });
  },

  onEndDateChange(e) {
    const newEnd = e.detail.value;
    const start = this.data.startDate;
    if (start && newEnd < start) {
      this.showError('结束日期不能早于开始日期，已自动修正');
      this.setData({ endDate: start, showError: true });
      return;
    }
    this.setData({ endDate: newEnd, showError: false });
  },

  onLocationInput(e) {
    this.setData({ diveLocation: e.detail.value, showError: false });
  },

  onCountInput(e) {
    this.setData({ diveCount: e.detail.value, showError: false });
  },

  showError(msg) {
    this.setData({ showError: true, errorMsg: msg });
    setTimeout(() => { this.setData({ showError: false }); }, 4000);
  },

  addRecord() {
    const { startDate, endDate, diveLocation, diveCount } = this.data;

    if (!startDate || !endDate) {
      this.showError('请选择完整的日期范围');
      return;
    }
    if (endDate < startDate) {
      this.showError('结束日期不能早于开始日期');
      return;
    }
    if (!diveLocation || diveLocation.trim() === '') {
      this.showError('请输入潜水地点');
      return;
    }
    const count = parseInt(diveCount, 10);
    if (isNaN(count) || count < 1) {
      this.showError('潜水次数必须大于 0');
      return;
    }

    const locationStr = diveLocation.trim();
    let records = [...this.data.records];

    const existingIndex = records.findIndex(
      r => r.location.toLowerCase() === locationStr.toLowerCase()
    );

    if (existingIndex !== -1) {
      const existing = records[existingIndex];
      const isCovered = existing.dateRanges.some(
        r => r.start <= startDate && r.end >= endDate
      );

      if (!isCovered) {
        existing.dateRanges.push({ start: startDate, end: endDate, count: count });
      } else {
         this.showError('该日期已在记录中，已为您自动忽略');
      }

    } else {
      const newRanges = [{ start: startDate, end: endDate, count: count }];
      records.push({
        id: this.generateId(),
        location: locationStr,
        dateRanges: newRanges,
        offsetX: 0,
        isMoving: false
      });
    }

    this.sortRecords(records);
    this.refreshTotals(records);

    this.setData({
      records,
      totalDives: this.calcTotalAll(records),
      recordCount: records.length,
      diveLocation: '',
      diveCount: 1,
      showError: false
    });

    this.saveRecords(records);
  },

  deleteRecord(e) {
    const id = e.currentTarget.dataset.id;
    let records = this.data.records.filter(r => r.id !== id);
    this.sortRecords(records);
    this.refreshTotals(records);

    this.setData({
      records,
      totalDives: this.calcTotalAll(records),
      recordCount: records.length
    });

    this.saveRecords(records);
  }
});