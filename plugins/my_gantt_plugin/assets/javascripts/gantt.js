document.addEventListener('DOMContentLoaded', function() {
  if (!document.getElementById('gantt-container')) return;
  new GanttChart(projectId);
});

class GanttChart {
  constructor(projectId) {
    this.projectId = projectId;
    this.container = document.getElementById('gantt-container');
    this.sideHeader = document.getElementById('gantt-side-header');
    this.sideBody = document.getElementById('gantt-side-body');
    this.headerScroll = document.getElementById('gantt-header-scroll');
    this.header = document.getElementById('gantt-header');
    this.bodyScroll = document.getElementById('gantt-body-scroll');
    this.body = document.getElementById('gantt-body'); // Usually just #gantt-body-scroll, but if there is an inner wrapper

    // In new HTML structure, bodyScroll contains the bars directly if we don't have an inner #gantt-body.
    // The previous view had #gantt-body inside #gantt-body-scroll.
    // Let's assume the View structure is still:
    // #gantt-body-scroll > #gantt-body
    if (!document.getElementById('gantt-body')) {
        const b = document.createElement('div');
        b.id = 'gantt-body';
        this.bodyScroll.appendChild(b);
    }
    this.body = document.getElementById('gantt-body');
    this.svg = document.getElementById('gantt-lines');

    const { zoom, months } = this.parseRangeParams();
    this.zoom = zoom;
    this.rangeMonths = months;
    this.dayWidth = this.dayWidthForZoom(zoom);
    this.container.style.setProperty('--gantt-day-width', `${this.dayWidth}px`);

    this.rowHeight = 40;
    this.barHeight = 20;
    this.barTop = (this.rowHeight - this.barHeight) / 2; // 10
    this.sideWidth = 400; // Default
    
    this.issues = [];
    this.relations = [];
    this.minDate = null;
    this.maxDate = null;
    
    this.dragState = null;
    window.ganttChart = this;

    // Resize Observer for responsiveness
    this.resizeObserver = new ResizeObserver(() => {
        // Debounce if needed, but for now just let the CSS Grid handle most.
        // If we need to re-render visible range, do it here.
        this.syncScroll();
    });
    this.resizeObserver.observe(this.container);

    this.init();
  }

  async init() {
    this.setupSVG();
    this.setupGridLines();
    await this.fetchData();
    if (this.issues.length === 0) {
        this.body.innerHTML += '<div style="padding:20px; color: var(--ds-text-subtle);">No issues found for this project.</div>';
        return;
    }
    this.calculateBounds();
    this.render();
    this.attachGlobalEvents();
    this.syncScroll();
    this.initResizer();
  }

  setupGridLines() {
      // Add horizontal grid lines via CSS on body
      this.body.style.backgroundImage = `
          linear-gradient(to right, var(--gantt-grid-line) 1px, transparent 1px),
          linear-gradient(to bottom, var(--ds-border) 1px, transparent 1px)
      `;
      this.body.style.backgroundSize = `${this.dayWidth}px 100%, 100% ${this.rowHeight}px`;
  }

  parseRangeParams() {
    const url = new URL(window.location.href);
    const zoom = parseInt(url.searchParams.get('zoom') || '2', 10);
    const months = parseInt(url.searchParams.get('months') || '3', 10);
    // 4: Day, 2: Week, 1: Month
    const clampedZoom = [1, 2, 4].includes(zoom) ? zoom : 2;
    const clampedMonths = [1, 3, 6].includes(months) ? months : 3;
    return { zoom: clampedZoom, months: clampedMonths };
  }

  dayWidthForZoom(zoom) {
    if (zoom === 4) return 48; // Day view
    if (zoom === 2) return 24; // Week view (narrower than before to fit more)
    return 16; // Month view
  }

  isoWeek(date) {
    const tmp = new Date(date);
    tmp.setHours(0, 0, 0, 0);
    tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
    const yearStart = new Date(tmp.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }
  
  setupSVG() {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'arrowhead');
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '7');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '3.5');
      marker.setAttribute('orient', 'auto');
      
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
      polygon.setAttribute('fill', '#6B778C'); // ds-text-subtle
      
      marker.appendChild(polygon);
      defs.appendChild(marker);
      this.svg.appendChild(defs);
  }

  async fetchData() {
    // Show loading?
    try {
        const response = await fetch(`/projects/${this.projectId}/gantts/data`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        this.issues = data.issues;
        this.relations = data.relations || [];

        this.issues.forEach(i => {
            i.start = i.start_date ? new Date(i.start_date) : new Date();
            i.due = i.due_date ? new Date(i.due_date) : new Date(i.start);
            i.start.setHours(0,0,0,0);
            i.due.setHours(0,0,0,0);
        });

        this.sortIssuesByHierarchy();
        this.updateVisibleIssues();
    } catch (e) {
        console.error(e);
        this.body.innerHTML = 'Error loading data.';
    }
  }
  
  sortIssuesByHierarchy() {
      const issueMap = new Map();
      this.issues.forEach(i => {
          i.children = [];
          if (i.expanded === undefined) i.expanded = true;
          issueMap.set(i.id, i);
      });
      
      const roots = [];
      this.issues.forEach(i => {
          if (i.parent_id && issueMap.has(i.parent_id)) {
              issueMap.get(i.parent_id).children.push(i);
          } else {
              roots.push(i);
          }
      });
      
      const sortNodes = (nodes) => {
          nodes.sort((a, b) => a.id - b.id);
          nodes.forEach(n => {
              if (n.children.length > 0) sortNodes(n.children);
          });
      };
      sortNodes(roots);
      this.rootIssues = roots;
  }

  updateVisibleIssues() {
      const visible = [];
      const traverse = (nodes, level) => {
          nodes.forEach(node => {
              node.level = level;
              visible.push(node);
              if (node.expanded && node.children.length > 0) {
                  traverse(node.children, level + 1);
              }
          });
      };
      traverse(this.rootIssues, 0);
      this.visibleIssues = visible;
  }

  toggleNode(issue) {
      issue.expanded = !issue.expanded;
      this.updateVisibleIssues();
      this.render();
  }

  calculateBounds() {
    if (this.issues.length === 0) return;
    let min = new Date(this.issues[0].start);
    let max = new Date(this.issues[0].due);

    this.issues.forEach(i => {
        if (i.start < min) min = new Date(i.start);
        if (i.due > max) max = new Date(i.due);
    });

    const start = new Date(min);
    start.setDate(1); // Start of month
    start.setMonth(start.getMonth() - 1); // Buffer

    const end = new Date(start);
    end.setMonth(end.getMonth() + this.rangeMonths + 2); // Buffer

    if (max > end) {
      end.setTime(max.getTime());
      end.setDate(end.getDate() + 30);
    }

    this.minDate = start;
    this.maxDate = end;
  }

  dateToPixels(date) {
    const diffTime = date - this.minDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays * this.dayWidth;
  }
  
  pixelsToDays(pixels) {
      return Math.round(pixels / this.dayWidth);
  }

  render() {
    this.renderSide();
    this.renderHeader();
    this.renderBody();
    this.renderConnections();
  }

  renderSide() {
    const columns = [
      { key: 'subject', label: 'Summary', width: 240, render: (i) => i.subject },
      { key: 'status', label: 'Status', width: 80, render: (i) => i.status },
    ];

    // Check if side width is manually adjusted, otherwise sum columns
    // Keeping user manual resize in mind.

    this.sideHeader.innerHTML = '';
    this.sideBody.innerHTML = '';

    const headerRow = document.createElement('div');
    headerRow.className = 'gantt-side-header-row';
    // Just minimal headers for now
    const col1 = document.createElement('div');
    col1.className = 'gantt-side-cell';
    col1.style.flex = '1';
    col1.textContent = 'ISSUES';
    headerRow.appendChild(col1);
    this.sideHeader.appendChild(headerRow);

    this.visibleIssues.forEach((issue) => {
      const row = document.createElement('div');
      row.className = 'gantt-side-row';

      const cell = document.createElement('div');
      cell.className = 'gantt-side-cell';
      cell.style.flex = '1';

      const indent = 8 + (issue.level * 20);
      cell.style.paddingLeft = `${indent}px`;

      if (issue.children.length > 0) {
          const toggle = document.createElement('span');
          toggle.className = 'gantt-toggle';
          toggle.textContent = issue.expanded ? '▼' : '▶';
          toggle.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.toggleNode(issue);
          };
          cell.appendChild(toggle);
      } else {
           const spacer = document.createElement('span');
           spacer.className = 'gantt-toggle'; // empty
           cell.appendChild(spacer);
      }

      const link = document.createElement('a');
      link.href = `/issues/${issue.id}/edit`;
      link.target = '_blank';
      link.textContent = issue.subject;
      link.style.color = 'var(--ds-link)';
      link.style.textDecoration = 'none';
      cell.appendChild(link);

      row.appendChild(cell);
      this.sideBody.appendChild(row);
    });
  }

  renderHeader() {
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysCount = Math.round((this.maxDate - this.minDate) / msPerDay) + 1;
    const totalWidth = daysCount * this.dayWidth;

    const topRow = document.createElement('div');
    topRow.className = 'gantt-header-row';
    const bottomRow = document.createElement('div');
    bottomRow.className = 'gantt-header-row';

    // Top Row: Months
    let cursor = new Date(this.minDate);
    while (cursor <= this.maxDate) {
      const endOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const segmentEnd = endOfMonth < this.maxDate ? endOfMonth : this.maxDate;
      const days = Math.round((segmentEnd - cursor) / msPerDay) + 1;
      const cell = document.createElement('div');
      cell.className = 'gantt-header-cell';
      cell.style.width = `${days * this.dayWidth}px`;
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      cell.textContent = `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`;
      topRow.appendChild(cell);
      cursor = new Date(segmentEnd);
      cursor.setDate(cursor.getDate() + 1);
    }

    // Bottom Row: Days or Weeks
    cursor = new Date(this.minDate);
    if (this.zoom === 4) { // Days
        while (cursor <= this.maxDate) {
            const cell = document.createElement('div');
            cell.className = 'gantt-header-cell bottom';
            cell.style.width = `${this.dayWidth}px`;
            cell.textContent = cursor.getDate();
            bottomRow.appendChild(cell);
            cursor.setDate(cursor.getDate() + 1);
        }
    } else { // Weeks
        // Align to start of week
        // We just render blocks of 7 days relative to start, or actual weeks
        // Simple approach: Render actual days but just show week numbers every 7 days?
        // Or render week blocks.
        while (cursor <= this.maxDate) {
             const day = cursor.getDay() || 7;
             const daysLeftInWeek = 8 - day;
             // But if we are in week mode, we might want aligned weeks.
             // Let's just render days but only text on Mondays
             const cell = document.createElement('div');
             cell.className = 'gantt-header-cell bottom';
             cell.style.width = `${this.dayWidth}px`;
             if (cursor.getDate() === 1 || cursor.getDay() === 1) {
                 cell.textContent = cursor.getDate();
             }
             bottomRow.appendChild(cell);
             cursor.setDate(cursor.getDate() + 1);
        }
    }

    this.header.innerHTML = '';
    this.header.appendChild(topRow);
    this.header.appendChild(bottomRow);

    this.header.style.width = `${totalWidth}px`;
    this.body.style.width = `${totalWidth}px`;
    this.svg.style.width = `${totalWidth}px`;
    this.svg.style.height = (this.visibleIssues.length * this.rowHeight) + 'px';

    // Update grid bg
    this.setupGridLines();
  }

  renderBody() {
    // Clear bars
    const bars = this.body.querySelectorAll('.gantt-bar-container');
    bars.forEach(b => b.remove());
    const bands = this.body.querySelectorAll('.gantt-day-band');
    bands.forEach(b => b.remove());

    this.renderDayBands();
    
    this.visibleIssues.forEach((issue, index) => {
        const left = this.dateToPixels(issue.start);
        const width = this.dateToPixels(issue.due) - left + this.dayWidth;

        const container = document.createElement('div');
        container.className = 'gantt-bar-container';
        container.dataset.id = issue.id;
        container.style.left = `${left}px`;
        container.style.width = `${width}px`;
        container.style.top = `${(index * this.rowHeight) + this.barTop}px`;
        
        const bar = document.createElement('div');
        bar.className = 'gantt-bar';
        if (issue.children.length > 0) {
            bar.classList.add('parent');
        } else {
             if (issue.status === 'Closed' || issue.done_ratio === 100) {
                bar.classList.add('done');
            } else if (new Date(issue.due) < new Date() && (issue.done_ratio || 0) < 100) {
                bar.classList.add('delayed');
            }
        }
        
        // Progress
        if (!(issue.children.length > 0)) {
            const progress = document.createElement('div');
            progress.className = 'gantt-bar-progress';
            progress.style.width = `${issue.done_ratio || 0}%`;
            bar.appendChild(progress);
        }
        
        container.appendChild(bar);

        // Label
        const label = document.createElement('div');
        label.className = 'gantt-bar-label';
        label.textContent = issue.subject;
        container.appendChild(label);
        
        // Handles (Improved Hit Areas)
        const leftHandle = document.createElement('div');
        leftHandle.className = 'gantt-handle-area left';
        leftHandle.innerHTML = '<div class="gantt-handle-visual"></div>';
        container.appendChild(leftHandle);
        
        const rightHandle = document.createElement('div');
        rightHandle.className = 'gantt-handle-area right';
        rightHandle.innerHTML = '<div class="gantt-handle-visual"></div>';
        container.appendChild(rightHandle);
        
        this.body.appendChild(container);
        
        container.addEventListener('mousedown', (e) => this.handleMouseDown(e, issue));
    });
  }

  renderDayBands() {
    const todayStr = new Date().toDateString();
    let cursor = new Date(this.minDate);
    let left = 0;

    // To optimize DOM, only render special bands (weekends, today)
    const bandsFragment = document.createDocumentFragment();

    while (cursor <= this.maxDate) {
      const wday = cursor.getDay();
      const isWeekend = wday === 0 || wday === 6;
      const isToday = cursor.toDateString() === todayStr;

      if (isWeekend || isToday) {
          const band = document.createElement('div');
          band.className = 'gantt-day-band';
          band.style.left = `${left}px`;
          if (isWeekend) band.classList.add('weekend');
          if (isToday) band.classList.add('today');
          bandsFragment.appendChild(band);
      }
      
      left += this.dayWidth;
      cursor.setDate(cursor.getDate() + 1);
    }
    this.body.appendChild(bandsFragment);
  }
  
  renderConnections() {
      // Clear existing paths (except defs)
      const paths = this.svg.querySelectorAll('path');
      paths.forEach(p => p.remove());
      
      this.relations.forEach(rel => {
          const fromIdx = this.visibleIssues.findIndex(i => i.id == rel.from);
          const toIdx = this.visibleIssues.findIndex(i => i.id == rel.to);
          
          if (fromIdx !== -1 && toIdx !== -1) {
              const fromIssue = this.visibleIssues[fromIdx];
              const toIssue = this.visibleIssues[toIdx];
              
              const x1 = this.dateToPixels(fromIssue.due) + this.dayWidth;
              const y1 = (fromIdx * this.rowHeight) + this.barTop + (this.barHeight / 2);
              
              const x2 = this.dateToPixels(toIssue.start);
              const y2 = (toIdx * this.rowHeight) + this.barTop + (this.barHeight / 2);
              
              this.drawPath(x1, y1, x2, y2);
          }
      });
  }
  
  drawPath(x1, y1, x2, y2) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'gantt-connection');
      
      const gap = 10;
      let d = '';
      
      if (x2 > x1 + gap) {
          const midX = x1 + gap;
          d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
      } else {
          const midX1 = x1 + gap;
          const midX2 = x2 - gap;
          const midY = y1 + (y2 > y1 ? 15 : -15); // Detour
          d = `M ${x1} ${y1} L ${midX1} ${y1} L ${midX1} ${midY} L ${midX2} ${midY} L ${midX2} ${y2} L ${x2} ${y2}`;
      }
      
      path.setAttribute('d', d);
      this.svg.appendChild(path);
  }

  handleMouseDown(e, issue) {
    // Check if clicking a handle
    const handle = e.target.closest('.gantt-handle-area');
    const container = e.target.closest('.gantt-bar-container');

    if (!container) return;

    e.stopPropagation();
    e.preventDefault(); // Prevent text selection

    if (handle) {
        const isRight = handle.classList.contains('right');
        this.dragState = {
            type: isRight ? 'resize-right' : 'resize-left',
            issue: issue,
            startX: e.clientX,
            initialWidth: container.offsetWidth,
            initialLeft: parseFloat(container.style.left),
            element: container
        };
    } else {
        // Move
        this.dragState = {
            type: 'move',
            issue: issue,
            startX: e.clientX,
            initialLeft: parseFloat(container.style.left),
            element: container
        };
    }

    document.body.style.cursor = 'grabbing';
  }

  attachGlobalEvents() {
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
  }

  handleMouseMove(e) {
      if (!this.dragState) return;

      const dx = e.clientX - this.dragState.startX;

      if (this.dragState.type === 'move') {
          this.dragState.element.style.left = (this.dragState.initialLeft + dx) + 'px';
      } else if (this.dragState.type === 'resize-right') {
          const newWidth = Math.max(this.dayWidth, this.dragState.initialWidth + dx);
          this.dragState.element.style.width = newWidth + 'px';
      } else if (this.dragState.type === 'resize-left') {
          const newWidth = Math.max(this.dayWidth, this.dragState.initialWidth - dx);
          const newLeft = this.dragState.initialLeft + (this.dragState.initialWidth - newWidth);
          this.dragState.element.style.width = newWidth + 'px';
          this.dragState.element.style.left = newLeft + 'px';
      }
  }

  async handleMouseUp(e) {
    if (this.dragState) {
        document.body.style.cursor = '';
        const dx = e.clientX - this.dragState.startX;
        const daysDiff = this.pixelsToDays(dx);
        
        let changed = false;

        if (this.dragState.type === 'move' && daysDiff !== 0) {
            const start = new Date(this.dragState.issue.start);
            const due = new Date(this.dragState.issue.due);
            start.setDate(start.getDate() + daysDiff);
            due.setDate(due.getDate() + daysDiff);
            
            // Optimistic update
            this.dragState.issue.start = start;
            this.dragState.issue.due = due;
            changed = true;
            await this.updateIssue(this.dragState.issue.id, start, due);
            
        } else if (this.dragState.type === 'resize-right' && daysDiff !== 0) {
            const due = new Date(this.dragState.issue.due);
            due.setDate(due.getDate() + daysDiff);
            if (due >= this.dragState.issue.start) {
                this.dragState.issue.due = due;
                changed = true;
                await this.updateIssue(this.dragState.issue.id, this.dragState.issue.start, due);
            }
        } else if (this.dragState.type === 'resize-left' && daysDiff !== 0) {
             const start = new Date(this.dragState.issue.start);
             start.setDate(start.getDate() + daysDiff); // dx positive -> start later
             if (start <= this.dragState.issue.due) {
                 this.dragState.issue.start = start;
                 changed = true;
                 await this.updateIssue(this.dragState.issue.id, start, this.dragState.issue.due);
             }
        }
        
        this.dragState = null;
        this.render(); // Snap to grid
    }
  }

  async updateIssue(id, start, due) {
      const formatDate = (d) => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
      };

      try {
          const response = await fetch(`/gantts/${id}/update_issue`, {
              method: 'PUT',
              headers: {
                  'Content-Type': 'application/json',
                  'X-CSRF-Token': csrfToken
              },
              body: JSON.stringify({
                  start_date: formatDate(start),
                  due_date: formatDate(due)
              })
          });
          if (!response.ok) throw new Error('Update failed');
      } catch (err) {
          alert('Update failed');
          // Reload to revert
          window.location.reload();
      }
  }

  syncScroll() {
    if (this.bodyScroll && this.headerScroll) {
        this.headerScroll.scrollLeft = this.bodyScroll.scrollLeft;
        this.bodyScroll.addEventListener('scroll', () => {
            this.headerScroll.scrollLeft = this.bodyScroll.scrollLeft;
            this.sideBody.scrollTop = this.bodyScroll.scrollTop; // If we had vertical scroll on body
        });
    }
  }

  initResizer() {
    const handle = document.getElementById('gantt-resizer-header'); // Currently in HTML?
    // My new CSS assumes .gantt-resizer elements are in the grid.
    // The HTML has id="gantt-resizer-header" for the top one.
    if (!handle) return;

    let startX = 0;
    let startWidth = this.sideWidth;

    const onMove = (e) => {
      const delta = e.clientX - startX;
      const next = Math.min(Math.max(startWidth + delta, 200), 800);
      this.sideWidth = next;
      this.container.style.setProperty('--gantt-side-width', `${next}px`);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = this.sideWidth;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}
