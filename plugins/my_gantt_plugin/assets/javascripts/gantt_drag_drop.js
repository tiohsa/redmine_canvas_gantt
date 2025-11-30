$(function() {
  // Only run if we are on the Gantt page
  if ($('#gantt_area').length === 0) {
    console.log("Gantt area not found, skipping drag drop init.");
    return;
  }

  console.log("Gantt Drag & Drop Plugin Loaded");

  if (typeof $.fn.draggable === 'undefined') {
    console.error("jQuery UI Draggable not loaded!");
    return;
  }

  // Inject SVG layer for drawing lines
  var $svgLayer = $('<svg id="gantt_draw_area" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:visible;"><line id="gantt_drag_line" x1="0" y1="0" x2="0" y2="0" style="display:none;stroke:#666;stroke-width:2;stroke-dasharray:5,5;"/></svg>');
  $('#gantt_area').append($svgLayer);

  function getPixelsPerDay() {
    var headers = $('.gantt_hdr');
    if (headers.length === 0) return 24; 

    var maxTop = 0;
    headers.each(function() {
      var t = parseInt($(this).css('top'), 10);
      if (t > maxTop) maxTop = t;
    });

    var bottomHeaders = headers.filter(function() {
      return parseInt($(this).css('top'), 10) == maxTop;
    });

    if (bottomHeaders.length > 0) {
      return $(bottomHeaders[0]).outerWidth();
    }
    return 24;
  }

  function getIssueId(element) {
    var idAttr = $(element).attr('id');
    if (idAttr) {
      // Matches task-todo-issue-123
      var match = idAttr.match(/issue-(\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  function formatDate(date) {
    var d = new Date(date),
        month = '' + (d.getMonth() + 1),
        day = '' + d.getDate(),
        year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
  }

  function updateIssue(issueId, dayShift, durationChange) {
    if (!issueId) return;

    // Fetch current issue data to get start/due dates
    $.ajax({
      url: '/issues/' + issueId + '.json',
      type: 'GET',
      success: function(data) {
        var issue = data.issue;
        if (!issue.start_date || !issue.due_date) {
          alert("Cannot update issue without start or due date.");
          return;
        }

        var start = new Date(issue.start_date);
        var due = new Date(issue.due_date);

        // Calculate new dates
        var newStart = new Date(start);
        newStart.setDate(start.getDate() + dayShift);
        
        var newDue = new Date(due);
        newDue.setDate(due.getDate() + dayShift + durationChange);

        var payload = {
          issue: {
            start_date: formatDate(newStart),
            due_date: formatDate(newDue)
          }
        };

        var csrfToken = $('meta[name="csrf-token"]').attr('content');

        $.ajax({
          url: '/issues/' + issueId + '.json',
          type: 'PUT',
          contentType: 'application/json',
          data: JSON.stringify(payload),
          xhrFields: {
            withCredentials: true
          },
          headers: {
            'X-CSRF-Token': csrfToken,
            'X-Redmine-API-Key': window.redmineApiKey
          },
          success: function() {
            console.log('Issue ' + issueId + ' updated.');
            // Reload to refresh the Gantt chart
            location.reload();
          },
          error: function(xhr) {
            console.error('Failed to update issue', xhr);
            if (xhr.status === 403) {
               alert('Permission denied. Please ensure you are logged in and have permission to edit issues.');
            } else {
               alert('Failed to update issue. Status: ' + xhr.status);
            }
          }
        });
      }
    });
  }

  function createDependency(sourceId, targetId) {
    if (sourceId === targetId) return;
    
    if (!confirm('Create dependency: Issue #' + sourceId + ' precedes Issue #' + targetId + '?')) {
      return;
    }

    var payload = {
      relation: {
        issue_to_id: targetId,
        relation_type: 'precedes' // Default to precedes
      }
    };

    var csrfToken = $('meta[name="csrf-token"]').attr('content');

    $.ajax({
      url: '/issues/' + sourceId + '/relations.json',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload),
      xhrFields: {
        withCredentials: true
      },
      headers: {
        'X-CSRF-Token': csrfToken,
        'X-Redmine-API-Key': window.redmineApiKey
      },
      success: function() {
        console.log('Dependency created between ' + sourceId + ' and ' + targetId);
        location.reload();
      },
      error: function(xhr) {
        console.error('Failed to create dependency', xhr);
        var msg = 'Failed to create dependency.';
        if (xhr.responseJSON && xhr.responseJSON.errors) {
          msg += '\n' + xhr.responseJSON.errors.join('\n');
        }
        alert(msg);
      }
    });
  }
  
  var pxPerDay = getPixelsPerDay();
  console.log("Pixels per day:", pxPerDay);

  // Target only the todo bars (the main background bars)
  var tasks = $('.task_todo');
  console.log("Found " + tasks.length + " draggable tasks.");

  tasks.each(function() {
    var $this = $(this);
    
    if (!getIssueId($this)) return;

    // Append connectors
    var $connLeft = $('<div class="gantt_connector left"></div>');
    var $connRight = $('<div class="gantt_connector right"></div>');
    $this.append($connLeft).append($connRight);

    // Draggable
    $this.draggable({
      axis: 'x',
      containment: '#gantt_area',
      grid: [pxPerDay, 1], 
      cancel: '.gantt_connector, .ui-resizable-handle', // Prevent dragging when clicking connectors
      start: function(event, ui) {
        $this.data('start-left', ui.position.left);
      },
      stop: function(event, ui) {
        var dx = ui.position.left - $this.data('start-left');
        var days = Math.round(dx / pxPerDay);
        
        if (days !== 0) {
          updateIssue(getIssueId($this), days, 0);
        }
      }
    });

    // Resizable
    $this.resizable({
      handles: 'e, w',
      grid: [pxPerDay, 1],
      start: function(event, ui) {
        $this.data('start-left', ui.position.left);
        $this.data('start-width', ui.size.width);
      },
      stop: function(event, ui) {
        var dWidth = ui.size.width - $this.data('start-width');
        var dLeft = ui.position.left - $this.data('start-left');
        
        var dayShift = Math.round(dLeft / pxPerDay);
        var durationChange = Math.round(dWidth / pxPerDay);
        
        if (dayShift !== 0 || durationChange !== 0) {
          updateIssue(getIssueId($this), dayShift, durationChange);
        }
      }
    });

    // Connector Drag Logic
    $this.find('.gantt_connector').on('mousedown', function(e) {
      e.stopPropagation();
      e.preventDefault();
      
      var $connector = $(this);
      var sourceIssueId = getIssueId($this);
      var $dragLine = $('#gantt_drag_line');
      var $ganttArea = $('#gantt_area');
      
      // Calculate start position relative to #gantt_area
      // We assume #gantt_area is the offset parent for the SVG
      var containerOffset = $ganttArea.offset();
      var connOffset = $connector.offset();
      
      var startX = (connOffset.left - containerOffset.left) + $ganttArea.scrollLeft() + ($connector.width() / 2);
      var startY = (connOffset.top - containerOffset.top) + $ganttArea.scrollTop() + ($connector.height() / 2);
      
      $dragLine.attr('x1', startX).attr('y1', startY).attr('x2', startX).attr('y2', startY).show();
      
      $(document).on('mousemove.gantt_connect', function(e) {
        var curX = (e.pageX - containerOffset.left) + $ganttArea.scrollLeft();
        var curY = (e.pageY - containerOffset.top) + $ganttArea.scrollTop();
        $dragLine.attr('x2', curX).attr('y2', curY);
      });
      
      $(document).on('mouseup.gantt_connect', function(e) {
        $(document).off('.gantt_connect');
        $dragLine.hide();
        
        // Find target
        // Temporarily hide the connector to see what's underneath if needed, 
        // but pointer-events:none on SVG should allow clicking through.
        // We need to check what element is at the mouse position.
        var target = document.elementFromPoint(e.clientX, e.clientY);
        var $targetTask = $(target).closest('.task_todo');
        
        if ($targetTask.length > 0) {
          var targetId = getIssueId($targetTask);
          if (targetId && targetId !== sourceIssueId) {
            createDependency(sourceIssueId, targetId);
          }
        }
      });
    });
  });

  // Context Menu Logic
  function deleteRelation(relationId) {
    if (!confirm('Are you sure you want to delete this dependency?')) return;

    var csrfToken = $('meta[name="csrf-token"]').attr('content');

    $.ajax({
      url: '/relations/' + relationId + '.json',
      type: 'DELETE',
      xhrFields: {
        withCredentials: true
      },
      headers: {
        'X-CSRF-Token': csrfToken,
        'X-Redmine-API-Key': window.redmineApiKey
      },
      success: function() {
        console.log('Relation ' + relationId + ' deleted.');
        location.reload();
      },
      error: function(xhr) {
        console.error('Failed to delete relation', xhr);
        alert('Failed to delete relation.');
      }
    });
  }

  function showContextMenu(x, y, relations, currentIssueId) {
    $('#gantt-context-menu').remove();

    var $menu = $('<div id="gantt-context-menu"><ul></ul></div>');
    var $ul = $menu.find('ul');

    if (!relations || relations.length === 0) {
      $ul.append('<li>No dependencies</li>');
    } else {
      relations.forEach(function(rel) {
        var otherId = (rel.issue_id == currentIssueId) ? rel.issue_to_id : rel.issue_id;
        var type = rel.relation_type;
        // Label: Delete relation: precedes -> #123
        var arrow = (rel.issue_id == currentIssueId) ? '->' : '<-';
        var label = 'Delete relation: ' + type + ' ' + arrow + ' #' + otherId;

        var $li = $('<li>' + label + '</li>');
        $li.on('click', function() {
          deleteRelation(rel.id);
        });
        $ul.append($li);
      });
    }

    $('body').append($menu);
    $menu.css({ top: y, left: x }).show();
  }

  $(document).on('contextmenu', '.task_todo', function(e) {
    e.preventDefault();
    e.stopPropagation();

    var issueId = getIssueId(this);
    if (!issueId) return;

    $.ajax({
      url: '/issues/' + issueId + '.json?include=relations',
      type: 'GET',
      headers: {
          'X-Redmine-API-Key': window.redmineApiKey
      },
      success: function(data) {
        showContextMenu(e.pageX, e.pageY, data.issue.relations, issueId);
      },
      error: function() {
          alert('Failed to fetch issue details.');
      }
    });
  });

  $(document).on('click', function() {
    $('#gantt-context-menu').remove();
  });
});
