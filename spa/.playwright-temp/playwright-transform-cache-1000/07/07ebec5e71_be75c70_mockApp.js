const defaultMockData = {
  tasks: [{
    id: 101,
    subject: 'Implement sidebar resize behavior',
    project_id: 1,
    project_name: 'Alpha',
    start_date: '2026-02-01',
    due_date: '2026-02-10',
    ratio_done: 40,
    tracker_id: 1,
    status_id: 1,
    status_name: 'New',
    assigned_to_id: 10,
    assigned_to_name: 'Jane Doe',
    lock_version: 1,
    editable: true,
    can_log_time: true,
    display_order: 0
  }, {
    id: 102,
    subject: 'Fix login flow',
    project_id: 1,
    project_name: 'Alpha',
    start_date: '2026-02-05',
    due_date: '2026-02-12',
    ratio_done: 10,
    tracker_id: 1,
    status_id: 2,
    status_name: 'In Progress',
    assigned_to_id: 11,
    assigned_to_name: 'John Smith',
    lock_version: 1,
    editable: true,
    can_log_time: true,
    display_order: 1,
    parent_id: 101
  }, {
    id: 201,
    subject: 'Release prep',
    project_id: 2,
    project_name: 'Beta',
    start_date: '2026-02-08',
    due_date: '2026-02-18',
    ratio_done: 90,
    tracker_id: 1,
    status_id: 3,
    status_name: 'Closed',
    assigned_to_id: 12,
    assigned_to_name: 'Mary Major',
    lock_version: 1,
    editable: true,
    can_log_time: true,
    display_order: 2
  }],
  relations: [{
    id: 1,
    issue_from_id: 101,
    issue_to_id: 102,
    relation_type: 'precedes'
  }],
  versions: [{
    id: 1,
    name: 'v1.0',
    effective_date: '2026-02-28',
    status: 'open',
    project_id: 1
  }],
  statuses: [{
    id: 1,
    name: 'New',
    is_closed: false
  }, {
    id: 2,
    name: 'In Progress',
    is_closed: false
  }, {
    id: 3,
    name: 'Closed',
    is_closed: true
  }],
  project: {
    id: 1,
    name: 'Canvas Gantt'
  },
  permissions: {
    editable: true,
    viewable: true
  }
};
const createEditMeta = (taskId, data) => {
  var _current$assigned_to_, _current$tracker_id, _current$fixed_versio;
  const task = data.tasks.find(t => String(t.id) === taskId);
  const current = task !== null && task !== void 0 ? task : data.tasks[0];
  return {
    task: {
      id: current.id,
      subject: current.subject,
      assigned_to_id: (_current$assigned_to_ = current.assigned_to_id) !== null && _current$assigned_to_ !== void 0 ? _current$assigned_to_ : null,
      status_id: current.status_id,
      done_ratio: current.ratio_done,
      due_date: current.due_date,
      start_date: current.start_date,
      priority_id: 1,
      category_id: null,
      estimated_hours: 8,
      project_id: current.project_id,
      tracker_id: (_current$tracker_id = current.tracker_id) !== null && _current$tracker_id !== void 0 ? _current$tracker_id : 1,
      fixed_version_id: (_current$fixed_versio = current.fixed_version_id) !== null && _current$fixed_versio !== void 0 ? _current$fixed_versio : 1,
      lock_version: current.lock_version
    },
    editable: {
      subject: true,
      assigned_to_id: true,
      status_id: true,
      done_ratio: true,
      due_date: true,
      start_date: true,
      priority_id: true,
      category_id: true,
      estimated_hours: true,
      project_id: true,
      tracker_id: true,
      fixed_version_id: true,
      custom_field_values: true
    },
    options: {
      statuses: data.statuses.map(s => ({
        id: s.id,
        name: s.name
      })),
      assignees: [{
        id: 10,
        name: 'Jane Doe'
      }, {
        id: 11,
        name: 'John Smith'
      }, {
        id: 12,
        name: 'Mary Major'
      }],
      priorities: [{
        id: 1,
        name: 'Normal'
      }],
      categories: [],
      projects: [{
        id: 1,
        name: 'Alpha'
      }, {
        id: 2,
        name: 'Beta'
      }],
      trackers: [{
        id: 1,
        name: 'Task'
      }],
      versions: [{
        id: 1,
        name: 'v1.0'
      }],
      custom_fields: []
    },
    custom_field_values: {}
  };
};
const includePersistedAssignee = (meta, data, taskId) => {
  const persistedTask = data.tasks.find(task => String(task.id) === taskId);
  if ((persistedTask === null || persistedTask === void 0 ? void 0 : persistedTask.assigned_to_id) == null || !persistedTask.assigned_to_name) return;
  if (meta.options.assignees.some(option => option.id === persistedTask.assigned_to_id)) return;
  meta.options.assignees = [...meta.options.assignees, {
    id: persistedTask.assigned_to_id,
    name: persistedTask.assigned_to_name
  }];
};
const cloneData = data => JSON.parse(JSON.stringify(data));
const parseSelectedIds = (url, key) => url.searchParams.getAll(`${key}[]`).concat(url.searchParams.getAll(key)).flatMap(value => value.split(/[|,]/).map(entry => entry.trim()).filter(Boolean));
const deriveInitialState = (url, data) => {
  var _data$initial_state;
  const statusIds = parseSelectedIds(url, 'status_ids').map(Number).filter(Number.isFinite);
  const projectIds = parseSelectedIds(url, 'project_ids').filter(id => id !== 'none' && id !== '_none');
  const queryId = url.searchParams.get('query_id');
  const memberProjectsOnly = url.searchParams.get('member_projects_only') === '1';
  return {
    ...((_data$initial_state = data.initial_state) !== null && _data$initial_state !== void 0 ? _data$initial_state : {}),
    ...(queryId && /^\d+$/.test(queryId) ? {
      queryId: Number(queryId)
    } : {}),
    ...(statusIds.length > 0 ? {
      selectedStatusIds: statusIds
    } : {}),
    ...(projectIds.length > 0 ? {
      selectedProjectIds: projectIds
    } : {}),
    ...(memberProjectsOnly ? {
      memberProjectsOnly: true
    } : {})
  };
};
const filterByQuery = (route, data) => {
  const url = new URL(route.request().url());
  const selectedStatuses = parseSelectedIds(url, 'status_ids').map(v => Number(v)).filter(Number.isFinite);
  const selectedProjects = parseSelectedIds(url, 'project_ids').filter(id => id !== 'none' && id !== '_none');
  const visibleProjectIds = new Set(selectedProjects);
  const tasks = data.tasks.filter(task => {
    if (selectedStatuses.length > 0 && !selectedStatuses.includes(task.status_id)) return false;
    if (visibleProjectIds.size > 0 && !visibleProjectIds.has(String(task.project_id))) return false;
    return true;
  });
  return {
    ...data,
    tasks,
    relations: data.relations.filter(relation => {
      const taskIds = new Set(tasks.map(task => String(task.id)));
      return taskIds.has(String(relation.issue_from_id)) && taskIds.has(String(relation.issue_to_id));
    }),
    initial_state: deriveInitialState(url, data)
  };
};
const isTaskVisibleInCurrentRequest = (route, data, taskId) => {
  const filtered = filterByQuery(route, data);
  return filtered.tasks.some(task => String(task.id) === taskId);
};
const isRelationVisibleInCurrentRequest = (route, data, relationId) => {
  const filtered = filterByQuery(route, data);
  return filtered.relations.some(relation => String(relation.id) === relationId);
};
export const setupMockApp = async (page, options) => {
  var _options$mockData;
  const data = cloneData((_options$mockData = options === null || options === void 0 ? void 0 : options.mockData) !== null && _options$mockData !== void 0 ? _options$mockData : defaultMockData);
  const preferences = {
    groupByProject: false,
    visibleColumns: ['id', 'subject', 'status', 'assignee', 'startDate', 'dueDate', 'ratioDone'],
    sidebarWidth: 420,
    viewport: {
      scrollX: 0,
      scrollY: 0
    },
    ...(options === null || options === void 0 ? void 0 : options.preferences)
  };
  await page.addInitScript(initialPreferences => {
    if (!localStorage.getItem('canvasGantt:preferences')) {
      localStorage.setItem('canvasGantt:preferences', JSON.stringify(initialPreferences));
    }
    window.RedmineCanvasGantt = {
      projectId: 1,
      apiBase: '/projects/1/canvas_gantt',
      redmineBase: '',
      authToken: 'test-token',
      apiKey: 'test-api-key',
      userId: 1,
      i18n: {
        field_subject: 'Task Name',
        field_status: 'Status',
        field_assigned_to: 'Assignee'
      },
      settings: {
        inline_edit_subject: '1',
        inline_edit_assigned_to: '1',
        inline_edit_status: '1',
        inline_edit_done_ratio: '1',
        inline_edit_due_date: '1',
        inline_edit_start_date: '1',
        test_mode: '1'
      }
    };
  }, preferences);
  await page.route('**/canvas_gantt/queries.json', async route => {
    var _options$savedQueries;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        queries: (_options$savedQueries = options === null || options === void 0 ? void 0 : options.savedQueries) !== null && _options$savedQueries !== void 0 ? _options$savedQueries : []
      })
    });
  });
  await page.route('**/canvas_gantt/data.json**', async route => {
    const payload = filterByQuery(route, data);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload)
    });
  });
  await page.route('**/canvas_gantt/tasks/*/edit_meta/preview.json**', async route => {
    var _url$pathname$match$, _url$pathname$match, _body$task, _intent$project_id, _intent$tracker_id, _options$editOptionsB, _options$editProjects, _ref, _projectOptions$track, _ref2, _projectOptions$categ, _ref3, _projectOptions$versi, _ref4, _projectOptions$assig, _options$editStatusBy, _materialized$project, _materialized$tracker, _materialized$status_, _intent$lock_version;
    const url = new URL(route.request().url());
    const taskId = (_url$pathname$match$ = (_url$pathname$match = url.pathname.match(/tasks\/(\d+)\/edit_meta\/preview\.json$/)) === null || _url$pathname$match === void 0 ? void 0 : _url$pathname$match[1]) !== null && _url$pathname$match$ !== void 0 ? _url$pathname$match$ : '101';
    const meta = createEditMeta(taskId, data);
    const body = route.request().postDataJSON();
    const intent = (_body$task = body.task) !== null && _body$task !== void 0 ? _body$task : {};
    const targetProjectId = String((_intent$project_id = intent.project_id) !== null && _intent$project_id !== void 0 ? _intent$project_id : meta.task.project_id);
    const targetTrackerId = String((_intent$tracker_id = intent.tracker_id) !== null && _intent$tracker_id !== void 0 ? _intent$tracker_id : meta.task.tracker_id);
    const projectOptions = options === null || options === void 0 || (_options$editOptionsB = options.editOptionsByProject) === null || _options$editOptionsB === void 0 ? void 0 : _options$editOptionsB[targetProjectId];
    meta.options.projects = (_options$editProjects = options === null || options === void 0 ? void 0 : options.editProjects) !== null && _options$editProjects !== void 0 ? _options$editProjects : meta.options.projects;
    meta.options.trackers = (_ref = (_projectOptions$track = projectOptions === null || projectOptions === void 0 ? void 0 : projectOptions.trackers) !== null && _projectOptions$track !== void 0 ? _projectOptions$track : options === null || options === void 0 ? void 0 : options.editTrackers) !== null && _ref !== void 0 ? _ref : meta.options.trackers;
    meta.options.categories = (_ref2 = (_projectOptions$categ = projectOptions === null || projectOptions === void 0 ? void 0 : projectOptions.categories) !== null && _projectOptions$categ !== void 0 ? _projectOptions$categ : options === null || options === void 0 ? void 0 : options.editCategories) !== null && _ref2 !== void 0 ? _ref2 : meta.options.categories;
    meta.options.versions = (_ref3 = (_projectOptions$versi = projectOptions === null || projectOptions === void 0 ? void 0 : projectOptions.versions) !== null && _projectOptions$versi !== void 0 ? _projectOptions$versi : options === null || options === void 0 ? void 0 : options.editVersions) !== null && _ref3 !== void 0 ? _ref3 : meta.options.versions;
    meta.options.assignees = (_ref4 = (_projectOptions$assig = projectOptions === null || projectOptions === void 0 ? void 0 : projectOptions.assignees) !== null && _projectOptions$assig !== void 0 ? _projectOptions$assig : options === null || options === void 0 ? void 0 : options.editAssignees) !== null && _ref4 !== void 0 ? _ref4 : meta.options.assignees;
    const trackerStatus = options === null || options === void 0 || (_options$editStatusBy = options.editStatusByTracker) === null || _options$editStatusBy === void 0 ? void 0 : _options$editStatusBy[targetTrackerId];
    if (trackerStatus && !meta.options.statuses.some(status => status.id === trackerStatus.id)) {
      meta.options.statuses = [...meta.options.statuses, trackerStatus];
    }
    includePersistedAssignee(meta, data, taskId);
    const materialized = Object.fromEntries(Object.entries(intent).filter(([field]) => field !== 'lock_version'));
    const projectChanged = Number(targetProjectId) !== Number(meta.task.project_id);
    if (projectChanged && materialized.tracker_id === undefined && meta.options.trackers[0]) {
      materialized.tracker_id = meta.options.trackers[0].id;
    }
    if (projectChanged) {
      materialized.fixed_version_id = null;
      materialized.category_id = null;
    }
    if (trackerStatus && intent.tracker_id !== undefined && intent.status_id === undefined && Number(targetTrackerId) !== Number(meta.task.tracker_id)) {
      materialized.status_id = trackerStatus.id;
    }
    const responseMeta = meta;
    responseMeta.capability_context = {
      task_id: Number(taskId),
      project_id: Number((_materialized$project = materialized.project_id) !== null && _materialized$project !== void 0 ? _materialized$project : meta.task.project_id),
      tracker_id: Number((_materialized$tracker = materialized.tracker_id) !== null && _materialized$tracker !== void 0 ? _materialized$tracker : meta.task.tracker_id),
      status_id: Number((_materialized$status_ = materialized.status_id) !== null && _materialized$status_ !== void 0 ? _materialized$status_ : meta.task.status_id)
    };
    const normalizations = materialized.tracker_id !== undefined && intent.tracker_id === undefined ? [{
      field: 'tracker_id',
      from: meta.task.tracker_id,
      to: materialized.tracker_id,
      source: 'policy'
    }] : [];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...responseMeta,
        draft_contract: {
          base_revision: Number((_intent$lock_version = intent.lock_version) !== null && _intent$lock_version !== void 0 ? _intent$lock_version : meta.task.lock_version),
          materialized,
          normalizations,
          violations: []
        }
      })
    });
  });
  await page.route('**/canvas_gantt/tasks/*/edit_meta.json**', async route => {
    var _url$pathname$match$2, _url$pathname$match2, _url$searchParams$get, _options$editOptionsB2, _options$editProjects2, _ref5, _projectOptions$track2, _ref6, _projectOptions$categ2, _ref7, _projectOptions$versi2, _ref8, _projectOptions$assig2;
    const url = new URL(route.request().url());
    const taskId = (_url$pathname$match$2 = (_url$pathname$match2 = url.pathname.match(/tasks\/(\d+)\/edit_meta\.json$/)) === null || _url$pathname$match2 === void 0 ? void 0 : _url$pathname$match2[1]) !== null && _url$pathname$match$2 !== void 0 ? _url$pathname$match$2 : '101';
    const meta = createEditMeta(taskId, data);
    const targetProjectId = (_url$searchParams$get = url.searchParams.get('target_project_id')) !== null && _url$searchParams$get !== void 0 ? _url$searchParams$get : String(meta.task.project_id);
    const projectOptions = options === null || options === void 0 || (_options$editOptionsB2 = options.editOptionsByProject) === null || _options$editOptionsB2 === void 0 ? void 0 : _options$editOptionsB2[targetProjectId];
    meta.options.projects = (_options$editProjects2 = options === null || options === void 0 ? void 0 : options.editProjects) !== null && _options$editProjects2 !== void 0 ? _options$editProjects2 : meta.options.projects;
    meta.options.trackers = (_ref5 = (_projectOptions$track2 = projectOptions === null || projectOptions === void 0 ? void 0 : projectOptions.trackers) !== null && _projectOptions$track2 !== void 0 ? _projectOptions$track2 : options === null || options === void 0 ? void 0 : options.editTrackers) !== null && _ref5 !== void 0 ? _ref5 : meta.options.trackers;
    meta.options.categories = (_ref6 = (_projectOptions$categ2 = projectOptions === null || projectOptions === void 0 ? void 0 : projectOptions.categories) !== null && _projectOptions$categ2 !== void 0 ? _projectOptions$categ2 : options === null || options === void 0 ? void 0 : options.editCategories) !== null && _ref6 !== void 0 ? _ref6 : meta.options.categories;
    meta.options.versions = (_ref7 = (_projectOptions$versi2 = projectOptions === null || projectOptions === void 0 ? void 0 : projectOptions.versions) !== null && _projectOptions$versi2 !== void 0 ? _projectOptions$versi2 : options === null || options === void 0 ? void 0 : options.editVersions) !== null && _ref7 !== void 0 ? _ref7 : meta.options.versions;
    meta.options.assignees = (_ref8 = (_projectOptions$assig2 = projectOptions === null || projectOptions === void 0 ? void 0 : projectOptions.assignees) !== null && _projectOptions$assig2 !== void 0 ? _projectOptions$assig2 : options === null || options === void 0 ? void 0 : options.editAssignees) !== null && _ref8 !== void 0 ? _ref8 : meta.options.assignees;
    includePersistedAssignee(meta, data, taskId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(meta)
    });
  });
  await page.route('**/canvas_gantt/tasks/*.json**', async route => {
    if (route.request().method() === 'PATCH') {
      var _route$request$url$ma, _route$request$url$ma2, _options$onPatchTask, _options$failTaskPatc, _task, _task$lock_version, _task$lock_version2;
      const taskId = (_route$request$url$ma = (_route$request$url$ma2 = route.request().url().match(/tasks\/(\d+)\.json/)) === null || _route$request$url$ma2 === void 0 ? void 0 : _route$request$url$ma2[1]) !== null && _route$request$url$ma !== void 0 ? _route$request$url$ma : '';
      const body = route.request().postDataJSON();
      options === null || options === void 0 || (_options$onPatchTask = options.onPatchTask) === null || _options$onPatchTask === void 0 || _options$onPatchTask.call(options, body);
      if (options !== null && options !== void 0 && options.failTaskPatch || options !== null && options !== void 0 && (_options$failTaskPatc = options.failTaskPatchWhen) !== null && _options$failTaskPatc !== void 0 && _options$failTaskPatc.call(options, taskId, body)) {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Update failed'
          })
        });
        return;
      }
      const task = data.tasks.find(entry => String(entry.id) === taskId);
      const fields = (_task = body.task) !== null && _task !== void 0 ? _task : {};
      if (task) {
        const previousProjectId = task.project_id;
        if (typeof fields.subject === 'string') task.subject = fields.subject;
        if (typeof fields.status_id === 'number') task.status_id = fields.status_id;
        if (typeof fields.done_ratio === 'number') task.ratio_done = fields.done_ratio;
        if (typeof fields.project_id === 'number') {
          var _options$editProjects3;
          task.project_id = fields.project_id;
          const project = options === null || options === void 0 || (_options$editProjects3 = options.editProjects) === null || _options$editProjects3 === void 0 ? void 0 : _options$editProjects3.find(candidate => candidate.id === fields.project_id);
          if (project) task.project_name = project.name;
          if (fields.project_id !== previousProjectId) {
            var _ref9, _options$editOptionsB3, _options$editOptionsB4;
            const targetTrackers = (_ref9 = (_options$editOptionsB3 = options === null || options === void 0 || (_options$editOptionsB4 = options.editOptionsByProject) === null || _options$editOptionsB4 === void 0 || (_options$editOptionsB4 = _options$editOptionsB4[String(task.project_id)]) === null || _options$editOptionsB4 === void 0 ? void 0 : _options$editOptionsB4.trackers) !== null && _options$editOptionsB3 !== void 0 ? _options$editOptionsB3 : options === null || options === void 0 ? void 0 : options.editTrackers) !== null && _ref9 !== void 0 ? _ref9 : [];
            if (fields.tracker_id === undefined && targetTrackers.length > 0 && !targetTrackers.some(candidate => candidate.id === task.tracker_id)) {
              task.tracker_id = targetTrackers[0].id;
              task.tracker_name = targetTrackers[0].name;
            }
            task.fixed_version_id = null;
            task.fixed_version_name = null;
            task.category_id = null;
            task.category_name = null;
          }
        }
        if (typeof fields.tracker_id === 'number') {
          var _options$editOptionsB5, _ref0, _options$editStatusBy2;
          const previousTrackerId = task.tracker_id;
          task.tracker_id = fields.tracker_id;
          const projectTrackers = options === null || options === void 0 || (_options$editOptionsB5 = options.editOptionsByProject) === null || _options$editOptionsB5 === void 0 || (_options$editOptionsB5 = _options$editOptionsB5[String(task.project_id)]) === null || _options$editOptionsB5 === void 0 ? void 0 : _options$editOptionsB5.trackers;
          const tracker = (_ref0 = projectTrackers !== null && projectTrackers !== void 0 ? projectTrackers : options === null || options === void 0 ? void 0 : options.editTrackers) === null || _ref0 === void 0 ? void 0 : _ref0.find(candidate => candidate.id === fields.tracker_id);
          if (tracker) task.tracker_name = tracker.name;
          const trackerStatus = options === null || options === void 0 || (_options$editStatusBy2 = options.editStatusByTracker) === null || _options$editStatusBy2 === void 0 ? void 0 : _options$editStatusBy2[String(fields.tracker_id)];
          if (trackerStatus && fields.status_id === undefined && previousTrackerId !== fields.tracker_id) {
            task.status_id = trackerStatus.id;
            task.status_name = trackerStatus.name;
          }
        }
        if (fields.fixed_version_id === null) {
          task.fixed_version_id = null;
          task.fixed_version_name = null;
        }
        if (fields.category_id === null) {
          task.category_id = null;
          task.category_name = null;
        }
        task.lock_version += 1;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          completeness: 'partial',
          entity: task,
          revision: (_task$lock_version = task === null || task === void 0 ? void 0 : task.lock_version) !== null && _task$lock_version !== void 0 ? _task$lock_version : 2,
          lock_version: (_task$lock_version2 = task === null || task === void 0 ? void 0 : task.lock_version) !== null && _task$lock_version2 !== void 0 ? _task$lock_version2 : 2,
          task_id: taskId
        })
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/canvas_gantt/relations.json**', async route => {
    if (route.request().method() === 'POST') {
      var _options$onCreateRela, _relation;
      const body = route.request().postDataJSON();
      options === null || options === void 0 || (_options$onCreateRela = options.onCreateRelation) === null || _options$onCreateRela === void 0 || _options$onCreateRela.call(options, body);
      const relationBody = (_relation = body.relation) !== null && _relation !== void 0 ? _relation : {};
      const nextId = String(data.relations.length + 100);
      const relation = {
        id: nextId,
        issue_from_id: relationBody.issue_from_id,
        issue_to_id: relationBody.issue_to_id,
        relation_type: relationBody.relation_type,
        ...(typeof relationBody.delay === 'number' ? {
          delay: relationBody.delay
        } : {})
      };
      data.relations.push(relation);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          relation
        })
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/canvas_gantt/relations/*.json**', async route => {
    var _route$request$url$ma3, _route$request$url$ma4;
    const relationId = (_route$request$url$ma3 = (_route$request$url$ma4 = route.request().url().match(/relations\/([^/]+)\.json/)) === null || _route$request$url$ma4 === void 0 ? void 0 : _route$request$url$ma4[1]) !== null && _route$request$url$ma3 !== void 0 ? _route$request$url$ma3 : '';
    if (options !== null && options !== void 0 && options.failRelationWhenHidden && !isRelationVisibleInCurrentRequest(route, data, relationId)) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Relation is outside current view'
        })
      });
      return;
    }
    if (route.request().method() === 'PATCH') {
      var _options$onUpdateRela, _relation2;
      const body = route.request().postDataJSON();
      options === null || options === void 0 || (_options$onUpdateRela = options.onUpdateRelation) === null || _options$onUpdateRela === void 0 || _options$onUpdateRela.call(options, relationId, body);
      const relation = data.relations.find(entry => String(entry.id) === relationId);
      const relationBody = (_relation2 = body.relation) !== null && _relation2 !== void 0 ? _relation2 : {};
      if (relation) {
        var _relationBody$relatio;
        relation.relation_type = (_relationBody$relatio = relationBody.relation_type) !== null && _relationBody$relatio !== void 0 ? _relationBody$relatio : relation.relation_type;
        if (typeof relationBody.delay === 'number') relation.delay = relationBody.delay;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          relation
        })
      });
      return;
    }
    if (route.request().method() === 'DELETE') {
      var _options$onDeleteRela;
      options === null || options === void 0 || (_options$onDeleteRela = options.onDeleteRelation) === null || _options$onDeleteRela === void 0 || _options$onDeleteRela.call(options, relationId);
      data.relations = data.relations.filter(entry => String(entry.id) !== relationId);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}'
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/canvas_gantt/subtasks/bulk.json**', async route => {
    if (route.request().method() === 'POST') {
      var _options$onBulkCreate, _parent_issue_id;
      const body = route.request().postDataJSON();
      options === null || options === void 0 || (_options$onBulkCreate = options.onBulkCreateSubtasks) === null || _options$onBulkCreate === void 0 || _options$onBulkCreate.call(options, body);
      const parentId = String((_parent_issue_id = body.parent_issue_id) !== null && _parent_issue_id !== void 0 ? _parent_issue_id : '');
      if (options !== null && options !== void 0 && options.failBulkCreateWhenParentHidden && !isTaskVisibleInCurrentRequest(route, data, parentId)) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Parent is outside current view'
          })
        });
        return;
      }
      const subjects = Array.isArray(body.subjects) ? body.subjects : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          success_count: subjects.length,
          fail_count: 0,
          results: subjects.map((subject, index) => ({
            status: 'ok',
            subject,
            issue_id: 900 + index
          }))
        })
      });
      return;
    }
    await route.fallback();
  });
};
export const waitForInitialRender = async page => {
  await page.goto('/');
  await page.getByTestId('cell-101-subject').waitFor({
    state: 'visible'
  });
};
export { defaultMockData };
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJkZWZhdWx0TW9ja0RhdGEiLCJ0YXNrcyIsImlkIiwic3ViamVjdCIsInByb2plY3RfaWQiLCJwcm9qZWN0X25hbWUiLCJzdGFydF9kYXRlIiwiZHVlX2RhdGUiLCJyYXRpb19kb25lIiwidHJhY2tlcl9pZCIsInN0YXR1c19pZCIsInN0YXR1c19uYW1lIiwiYXNzaWduZWRfdG9faWQiLCJhc3NpZ25lZF90b19uYW1lIiwibG9ja192ZXJzaW9uIiwiZWRpdGFibGUiLCJjYW5fbG9nX3RpbWUiLCJkaXNwbGF5X29yZGVyIiwicGFyZW50X2lkIiwicmVsYXRpb25zIiwiaXNzdWVfZnJvbV9pZCIsImlzc3VlX3RvX2lkIiwicmVsYXRpb25fdHlwZSIsInZlcnNpb25zIiwibmFtZSIsImVmZmVjdGl2ZV9kYXRlIiwic3RhdHVzIiwic3RhdHVzZXMiLCJpc19jbG9zZWQiLCJwcm9qZWN0IiwicGVybWlzc2lvbnMiLCJ2aWV3YWJsZSIsImNyZWF0ZUVkaXRNZXRhIiwidGFza0lkIiwiZGF0YSIsIl9jdXJyZW50JGFzc2lnbmVkX3RvXyIsIl9jdXJyZW50JHRyYWNrZXJfaWQiLCJfY3VycmVudCRmaXhlZF92ZXJzaW8iLCJ0YXNrIiwiZmluZCIsInQiLCJTdHJpbmciLCJjdXJyZW50IiwiZG9uZV9yYXRpbyIsInByaW9yaXR5X2lkIiwiY2F0ZWdvcnlfaWQiLCJlc3RpbWF0ZWRfaG91cnMiLCJmaXhlZF92ZXJzaW9uX2lkIiwiY3VzdG9tX2ZpZWxkX3ZhbHVlcyIsIm9wdGlvbnMiLCJtYXAiLCJzIiwiYXNzaWduZWVzIiwicHJpb3JpdGllcyIsImNhdGVnb3JpZXMiLCJwcm9qZWN0cyIsInRyYWNrZXJzIiwiY3VzdG9tX2ZpZWxkcyIsImluY2x1ZGVQZXJzaXN0ZWRBc3NpZ25lZSIsIm1ldGEiLCJwZXJzaXN0ZWRUYXNrIiwic29tZSIsIm9wdGlvbiIsImNsb25lRGF0YSIsIkpTT04iLCJwYXJzZSIsInN0cmluZ2lmeSIsInBhcnNlU2VsZWN0ZWRJZHMiLCJ1cmwiLCJrZXkiLCJzZWFyY2hQYXJhbXMiLCJnZXRBbGwiLCJjb25jYXQiLCJmbGF0TWFwIiwidmFsdWUiLCJzcGxpdCIsImVudHJ5IiwidHJpbSIsImZpbHRlciIsIkJvb2xlYW4iLCJkZXJpdmVJbml0aWFsU3RhdGUiLCJfZGF0YSRpbml0aWFsX3N0YXRlIiwic3RhdHVzSWRzIiwiTnVtYmVyIiwiaXNGaW5pdGUiLCJwcm9qZWN0SWRzIiwicXVlcnlJZCIsImdldCIsIm1lbWJlclByb2plY3RzT25seSIsImluaXRpYWxfc3RhdGUiLCJ0ZXN0IiwibGVuZ3RoIiwic2VsZWN0ZWRTdGF0dXNJZHMiLCJzZWxlY3RlZFByb2plY3RJZHMiLCJmaWx0ZXJCeVF1ZXJ5Iiwicm91dGUiLCJVUkwiLCJyZXF1ZXN0Iiwic2VsZWN0ZWRTdGF0dXNlcyIsInYiLCJzZWxlY3RlZFByb2plY3RzIiwidmlzaWJsZVByb2plY3RJZHMiLCJTZXQiLCJpbmNsdWRlcyIsInNpemUiLCJoYXMiLCJyZWxhdGlvbiIsInRhc2tJZHMiLCJpc1Rhc2tWaXNpYmxlSW5DdXJyZW50UmVxdWVzdCIsImZpbHRlcmVkIiwiaXNSZWxhdGlvblZpc2libGVJbkN1cnJlbnRSZXF1ZXN0IiwicmVsYXRpb25JZCIsInNldHVwTW9ja0FwcCIsInBhZ2UiLCJfb3B0aW9ucyRtb2NrRGF0YSIsIm1vY2tEYXRhIiwicHJlZmVyZW5jZXMiLCJncm91cEJ5UHJvamVjdCIsInZpc2libGVDb2x1bW5zIiwic2lkZWJhcldpZHRoIiwidmlld3BvcnQiLCJzY3JvbGxYIiwic2Nyb2xsWSIsImFkZEluaXRTY3JpcHQiLCJpbml0aWFsUHJlZmVyZW5jZXMiLCJsb2NhbFN0b3JhZ2UiLCJnZXRJdGVtIiwic2V0SXRlbSIsIndpbmRvdyIsIlJlZG1pbmVDYW52YXNHYW50dCIsInByb2plY3RJZCIsImFwaUJhc2UiLCJyZWRtaW5lQmFzZSIsImF1dGhUb2tlbiIsImFwaUtleSIsInVzZXJJZCIsImkxOG4iLCJmaWVsZF9zdWJqZWN0IiwiZmllbGRfc3RhdHVzIiwiZmllbGRfYXNzaWduZWRfdG8iLCJzZXR0aW5ncyIsImlubGluZV9lZGl0X3N1YmplY3QiLCJpbmxpbmVfZWRpdF9hc3NpZ25lZF90byIsImlubGluZV9lZGl0X3N0YXR1cyIsImlubGluZV9lZGl0X2RvbmVfcmF0aW8iLCJpbmxpbmVfZWRpdF9kdWVfZGF0ZSIsImlubGluZV9lZGl0X3N0YXJ0X2RhdGUiLCJ0ZXN0X21vZGUiLCJfb3B0aW9ucyRzYXZlZFF1ZXJpZXMiLCJmdWxmaWxsIiwiY29udGVudFR5cGUiLCJib2R5IiwicXVlcmllcyIsInNhdmVkUXVlcmllcyIsInBheWxvYWQiLCJfdXJsJHBhdGhuYW1lJG1hdGNoJCIsIl91cmwkcGF0aG5hbWUkbWF0Y2giLCJfYm9keSR0YXNrIiwiX2ludGVudCRwcm9qZWN0X2lkIiwiX2ludGVudCR0cmFja2VyX2lkIiwiX29wdGlvbnMkZWRpdE9wdGlvbnNCIiwiX29wdGlvbnMkZWRpdFByb2plY3RzIiwiX3JlZiIsIl9wcm9qZWN0T3B0aW9ucyR0cmFjayIsIl9yZWYyIiwiX3Byb2plY3RPcHRpb25zJGNhdGVnIiwiX3JlZjMiLCJfcHJvamVjdE9wdGlvbnMkdmVyc2kiLCJfcmVmNCIsIl9wcm9qZWN0T3B0aW9ucyRhc3NpZyIsIl9vcHRpb25zJGVkaXRTdGF0dXNCeSIsIl9tYXRlcmlhbGl6ZWQkcHJvamVjdCIsIl9tYXRlcmlhbGl6ZWQkdHJhY2tlciIsIl9tYXRlcmlhbGl6ZWQkc3RhdHVzXyIsIl9pbnRlbnQkbG9ja192ZXJzaW9uIiwicGF0aG5hbWUiLCJtYXRjaCIsInBvc3REYXRhSlNPTiIsImludGVudCIsInRhcmdldFByb2plY3RJZCIsInRhcmdldFRyYWNrZXJJZCIsInByb2plY3RPcHRpb25zIiwiZWRpdE9wdGlvbnNCeVByb2plY3QiLCJlZGl0UHJvamVjdHMiLCJlZGl0VHJhY2tlcnMiLCJlZGl0Q2F0ZWdvcmllcyIsImVkaXRWZXJzaW9ucyIsImVkaXRBc3NpZ25lZXMiLCJ0cmFja2VyU3RhdHVzIiwiZWRpdFN0YXR1c0J5VHJhY2tlciIsIm1hdGVyaWFsaXplZCIsIk9iamVjdCIsImZyb21FbnRyaWVzIiwiZW50cmllcyIsImZpZWxkIiwicHJvamVjdENoYW5nZWQiLCJ1bmRlZmluZWQiLCJyZXNwb25zZU1ldGEiLCJjYXBhYmlsaXR5X2NvbnRleHQiLCJ0YXNrX2lkIiwibm9ybWFsaXphdGlvbnMiLCJmcm9tIiwidG8iLCJzb3VyY2UiLCJkcmFmdF9jb250cmFjdCIsImJhc2VfcmV2aXNpb24iLCJ2aW9sYXRpb25zIiwiX3VybCRwYXRobmFtZSRtYXRjaCQyIiwiX3VybCRwYXRobmFtZSRtYXRjaDIiLCJfdXJsJHNlYXJjaFBhcmFtcyRnZXQiLCJfb3B0aW9ucyRlZGl0T3B0aW9uc0IyIiwiX29wdGlvbnMkZWRpdFByb2plY3RzMiIsIl9yZWY1IiwiX3Byb2plY3RPcHRpb25zJHRyYWNrMiIsIl9yZWY2IiwiX3Byb2plY3RPcHRpb25zJGNhdGVnMiIsIl9yZWY3IiwiX3Byb2plY3RPcHRpb25zJHZlcnNpMiIsIl9yZWY4IiwiX3Byb2plY3RPcHRpb25zJGFzc2lnMiIsIm1ldGhvZCIsIl9yb3V0ZSRyZXF1ZXN0JHVybCRtYSIsIl9yb3V0ZSRyZXF1ZXN0JHVybCRtYTIiLCJfb3B0aW9ucyRvblBhdGNoVGFzayIsIl9vcHRpb25zJGZhaWxUYXNrUGF0YyIsIl90YXNrIiwiX3Rhc2skbG9ja192ZXJzaW9uIiwiX3Rhc2skbG9ja192ZXJzaW9uMiIsIm9uUGF0Y2hUYXNrIiwiY2FsbCIsImZhaWxUYXNrUGF0Y2giLCJmYWlsVGFza1BhdGNoV2hlbiIsImVycm9yIiwiZmllbGRzIiwicHJldmlvdXNQcm9qZWN0SWQiLCJfb3B0aW9ucyRlZGl0UHJvamVjdHMzIiwiY2FuZGlkYXRlIiwiX3JlZjkiLCJfb3B0aW9ucyRlZGl0T3B0aW9uc0IzIiwiX29wdGlvbnMkZWRpdE9wdGlvbnNCNCIsInRhcmdldFRyYWNrZXJzIiwidHJhY2tlcl9uYW1lIiwiZml4ZWRfdmVyc2lvbl9uYW1lIiwiY2F0ZWdvcnlfbmFtZSIsIl9vcHRpb25zJGVkaXRPcHRpb25zQjUiLCJfcmVmMCIsIl9vcHRpb25zJGVkaXRTdGF0dXNCeTIiLCJwcmV2aW91c1RyYWNrZXJJZCIsInByb2plY3RUcmFja2VycyIsInRyYWNrZXIiLCJjb21wbGV0ZW5lc3MiLCJlbnRpdHkiLCJyZXZpc2lvbiIsImZhbGxiYWNrIiwiX29wdGlvbnMkb25DcmVhdGVSZWxhIiwiX3JlbGF0aW9uIiwib25DcmVhdGVSZWxhdGlvbiIsInJlbGF0aW9uQm9keSIsIm5leHRJZCIsImRlbGF5IiwicHVzaCIsIl9yb3V0ZSRyZXF1ZXN0JHVybCRtYTMiLCJfcm91dGUkcmVxdWVzdCR1cmwkbWE0IiwiZmFpbFJlbGF0aW9uV2hlbkhpZGRlbiIsIl9vcHRpb25zJG9uVXBkYXRlUmVsYSIsIl9yZWxhdGlvbjIiLCJvblVwZGF0ZVJlbGF0aW9uIiwiX3JlbGF0aW9uQm9keSRyZWxhdGlvIiwiX29wdGlvbnMkb25EZWxldGVSZWxhIiwib25EZWxldGVSZWxhdGlvbiIsIl9vcHRpb25zJG9uQnVsa0NyZWF0ZSIsIl9wYXJlbnRfaXNzdWVfaWQiLCJvbkJ1bGtDcmVhdGVTdWJ0YXNrcyIsInBhcmVudElkIiwicGFyZW50X2lzc3VlX2lkIiwiZmFpbEJ1bGtDcmVhdGVXaGVuUGFyZW50SGlkZGVuIiwic3ViamVjdHMiLCJBcnJheSIsImlzQXJyYXkiLCJzdWNjZXNzX2NvdW50IiwiZmFpbF9jb3VudCIsInJlc3VsdHMiLCJpbmRleCIsImlzc3VlX2lkIiwid2FpdEZvckluaXRpYWxSZW5kZXIiLCJnb3RvIiwiZ2V0QnlUZXN0SWQiLCJ3YWl0Rm9yIiwic3RhdGUiXSwic291cmNlcyI6WyJtb2NrQXBwLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgUGFnZSwgUm91dGUgfSBmcm9tICdAcGxheXdyaWdodC90ZXN0JztcblxudHlwZSBSYXdUYXNrID0ge1xuICBpZDogbnVtYmVyO1xuICBzdWJqZWN0OiBzdHJpbmc7XG4gIHByb2plY3RfaWQ6IG51bWJlcjtcbiAgcHJvamVjdF9uYW1lOiBzdHJpbmc7XG4gIHN0YXJ0X2RhdGU6IHN0cmluZztcbiAgZHVlX2RhdGU6IHN0cmluZztcbiAgcmF0aW9fZG9uZTogbnVtYmVyO1xuICBzdGF0dXNfaWQ6IG51bWJlcjtcbiAgc3RhdHVzX25hbWU6IHN0cmluZztcbiAgYXNzaWduZWRfdG9faWQ/OiBudW1iZXI7XG4gIGFzc2lnbmVkX3RvX25hbWU/OiBzdHJpbmc7XG4gIGxvY2tfdmVyc2lvbjogbnVtYmVyO1xuICBlZGl0YWJsZTogYm9vbGVhbjtcbiAgY2FuX2xvZ190aW1lPzogYm9vbGVhbjtcbiAgZGlzcGxheV9vcmRlcjogbnVtYmVyO1xuICBwYXJlbnRfaWQ/OiBudW1iZXI7XG4gIGZpeGVkX3ZlcnNpb25faWQ/OiBudW1iZXIgfCBudWxsO1xuICBmaXhlZF92ZXJzaW9uX25hbWU/OiBzdHJpbmcgfCBudWxsO1xuICBjYXRlZ29yeV9pZD86IG51bWJlciB8IG51bGw7XG4gIGNhdGVnb3J5X25hbWU/OiBzdHJpbmcgfCBudWxsO1xuICB0cmFja2VyX2lkPzogbnVtYmVyO1xuICB0cmFja2VyX25hbWU/OiBzdHJpbmc7XG4gIHByaW9yaXR5X2lkPzogbnVtYmVyO1xuICBwcmlvcml0eV9uYW1lPzogc3RyaW5nO1xuICBoYXNfY2hpbGRyZW4/OiBib29sZWFuO1xufTtcblxudHlwZSBNb2NrRGF0YSA9IHtcbiAgdGFza3M6IFJhd1Rhc2tbXTtcbiAgcmVsYXRpb25zOiBBcnJheTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj47XG4gIHZlcnNpb25zOiBBcnJheTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj47XG4gIHN0YXR1c2VzOiBBcnJheTx7IGlkOiBudW1iZXI7IG5hbWU6IHN0cmluZzsgaXNfY2xvc2VkOiBib29sZWFuIH0+O1xuICBwcm9qZWN0OiB7IGlkOiBudW1iZXI7IG5hbWU6IHN0cmluZyB9O1xuICBwZXJtaXNzaW9uczogeyBlZGl0YWJsZTogYm9vbGVhbjsgdmlld2FibGU6IGJvb2xlYW4gfTtcbiAgZmlsdGVyX29wdGlvbnM/OiB7XG4gICAgcHJvamVjdHM/OiBBcnJheTx7IGlkOiBudW1iZXIgfCBzdHJpbmc7IG5hbWU6IHN0cmluZyB9PjtcbiAgICBhc3NpZ25lZXM/OiBBcnJheTx7IGlkOiBudW1iZXIgfCBudWxsOyBuYW1lOiBzdHJpbmcgfCBudWxsOyBwcm9qZWN0X2lkcz86IEFycmF5PG51bWJlciB8IHN0cmluZz4gfT47XG4gIH07XG4gIGluaXRpYWxfc3RhdGU/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbn07XG5cbnR5cGUgU2V0dXBPcHRpb25zID0ge1xuICBtb2NrRGF0YT86IE1vY2tEYXRhO1xuICBwcmVmZXJlbmNlcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICBvblBhdGNoVGFzaz86IChwYXlsb2FkOiB1bmtub3duKSA9PiB2b2lkO1xuICBvbkNyZWF0ZVJlbGF0aW9uPzogKHBheWxvYWQ6IHVua25vd24pID0+IHZvaWQ7XG4gIG9uVXBkYXRlUmVsYXRpb24/OiAocmVsYXRpb25JZDogc3RyaW5nLCBwYXlsb2FkOiB1bmtub3duKSA9PiB2b2lkO1xuICBvbkRlbGV0ZVJlbGF0aW9uPzogKHJlbGF0aW9uSWQ6IHN0cmluZykgPT4gdm9pZDtcbiAgb25CdWxrQ3JlYXRlU3VidGFza3M/OiAocGF5bG9hZDogdW5rbm93bikgPT4gdm9pZDtcbiAgZmFpbFRhc2tQYXRjaD86IGJvb2xlYW47XG4gIGZhaWxUYXNrUGF0Y2hXaGVuPzogKHRhc2tJZDogc3RyaW5nLCBwYXlsb2FkOiB1bmtub3duKSA9PiBib29sZWFuO1xuICBmYWlsUmVsYXRpb25XaGVuSGlkZGVuPzogYm9vbGVhbjtcbiAgZmFpbEJ1bGtDcmVhdGVXaGVuUGFyZW50SGlkZGVuPzogYm9vbGVhbjtcbiAgc2F2ZWRRdWVyaWVzPzogQXJyYXk8eyBpZDogbnVtYmVyOyBuYW1lOiBzdHJpbmc7IGlzX3B1YmxpYzogYm9vbGVhbjsgcHJvamVjdF9pZDogbnVtYmVyIHwgbnVsbCB9PjtcbiAgZWRpdFByb2plY3RzPzogQXJyYXk8eyBpZDogbnVtYmVyOyBuYW1lOiBzdHJpbmcgfT47XG4gIGVkaXRUcmFja2Vycz86IEFycmF5PHsgaWQ6IG51bWJlcjsgbmFtZTogc3RyaW5nIH0+O1xuICBlZGl0Q2F0ZWdvcmllcz86IEFycmF5PHsgaWQ6IG51bWJlcjsgbmFtZTogc3RyaW5nIH0+O1xuICBlZGl0VmVyc2lvbnM/OiBBcnJheTx7IGlkOiBudW1iZXI7IG5hbWU6IHN0cmluZyB9PjtcbiAgZWRpdEFzc2lnbmVlcz86IEFycmF5PHsgaWQ6IG51bWJlcjsgbmFtZTogc3RyaW5nIH0+O1xuICBlZGl0U3RhdHVzQnlUcmFja2VyPzogUmVjb3JkPHN0cmluZywgeyBpZDogbnVtYmVyOyBuYW1lOiBzdHJpbmcgfT47XG4gIGVkaXRPcHRpb25zQnlQcm9qZWN0PzogUmVjb3JkPHN0cmluZywge1xuICAgIHRyYWNrZXJzPzogQXJyYXk8eyBpZDogbnVtYmVyOyBuYW1lOiBzdHJpbmcgfT47XG4gICAgY2F0ZWdvcmllcz86IEFycmF5PHsgaWQ6IG51bWJlcjsgbmFtZTogc3RyaW5nIH0+O1xuICAgIHZlcnNpb25zPzogQXJyYXk8eyBpZDogbnVtYmVyOyBuYW1lOiBzdHJpbmcgfT47XG4gICAgYXNzaWduZWVzPzogQXJyYXk8eyBpZDogbnVtYmVyOyBuYW1lOiBzdHJpbmcgfT47XG4gIH0+O1xufTtcblxuY29uc3QgZGVmYXVsdE1vY2tEYXRhOiBNb2NrRGF0YSA9IHtcbiAgdGFza3M6IFtcbiAgICB7XG4gICAgICBpZDogMTAxLFxuICAgICAgc3ViamVjdDogJ0ltcGxlbWVudCBzaWRlYmFyIHJlc2l6ZSBiZWhhdmlvcicsXG4gICAgICBwcm9qZWN0X2lkOiAxLFxuICAgICAgcHJvamVjdF9uYW1lOiAnQWxwaGEnLFxuICAgICAgc3RhcnRfZGF0ZTogJzIwMjYtMDItMDEnLFxuICAgICAgZHVlX2RhdGU6ICcyMDI2LTAyLTEwJyxcbiAgICAgIHJhdGlvX2RvbmU6IDQwLFxuICAgICAgdHJhY2tlcl9pZDogMSxcbiAgICAgIHN0YXR1c19pZDogMSxcbiAgICAgIHN0YXR1c19uYW1lOiAnTmV3JyxcbiAgICAgIGFzc2lnbmVkX3RvX2lkOiAxMCxcbiAgICAgIGFzc2lnbmVkX3RvX25hbWU6ICdKYW5lIERvZScsXG4gICAgICBsb2NrX3ZlcnNpb246IDEsXG4gICAgICBlZGl0YWJsZTogdHJ1ZSxcbiAgICAgIGNhbl9sb2dfdGltZTogdHJ1ZSxcbiAgICAgIGRpc3BsYXlfb3JkZXI6IDAsXG4gICAgfSxcbiAgICB7XG4gICAgICBpZDogMTAyLFxuICAgICAgc3ViamVjdDogJ0ZpeCBsb2dpbiBmbG93JyxcbiAgICAgIHByb2plY3RfaWQ6IDEsXG4gICAgICBwcm9qZWN0X25hbWU6ICdBbHBoYScsXG4gICAgICBzdGFydF9kYXRlOiAnMjAyNi0wMi0wNScsXG4gICAgICBkdWVfZGF0ZTogJzIwMjYtMDItMTInLFxuICAgICAgcmF0aW9fZG9uZTogMTAsXG4gICAgICB0cmFja2VyX2lkOiAxLFxuICAgICAgc3RhdHVzX2lkOiAyLFxuICAgICAgc3RhdHVzX25hbWU6ICdJbiBQcm9ncmVzcycsXG4gICAgICBhc3NpZ25lZF90b19pZDogMTEsXG4gICAgICBhc3NpZ25lZF90b19uYW1lOiAnSm9obiBTbWl0aCcsXG4gICAgICBsb2NrX3ZlcnNpb246IDEsXG4gICAgICBlZGl0YWJsZTogdHJ1ZSxcbiAgICAgIGNhbl9sb2dfdGltZTogdHJ1ZSxcbiAgICAgIGRpc3BsYXlfb3JkZXI6IDEsXG4gICAgICBwYXJlbnRfaWQ6IDEwMSxcbiAgICB9LFxuICAgIHtcbiAgICAgIGlkOiAyMDEsXG4gICAgICBzdWJqZWN0OiAnUmVsZWFzZSBwcmVwJyxcbiAgICAgIHByb2plY3RfaWQ6IDIsXG4gICAgICBwcm9qZWN0X25hbWU6ICdCZXRhJyxcbiAgICAgIHN0YXJ0X2RhdGU6ICcyMDI2LTAyLTA4JyxcbiAgICAgIGR1ZV9kYXRlOiAnMjAyNi0wMi0xOCcsXG4gICAgICByYXRpb19kb25lOiA5MCxcbiAgICAgIHRyYWNrZXJfaWQ6IDEsXG4gICAgICBzdGF0dXNfaWQ6IDMsXG4gICAgICBzdGF0dXNfbmFtZTogJ0Nsb3NlZCcsXG4gICAgICBhc3NpZ25lZF90b19pZDogMTIsXG4gICAgICBhc3NpZ25lZF90b19uYW1lOiAnTWFyeSBNYWpvcicsXG4gICAgICBsb2NrX3ZlcnNpb246IDEsXG4gICAgICBlZGl0YWJsZTogdHJ1ZSxcbiAgICAgIGNhbl9sb2dfdGltZTogdHJ1ZSxcbiAgICAgIGRpc3BsYXlfb3JkZXI6IDIsXG4gICAgfSxcbiAgXSxcbiAgcmVsYXRpb25zOiBbXG4gICAgeyBpZDogMSwgaXNzdWVfZnJvbV9pZDogMTAxLCBpc3N1ZV90b19pZDogMTAyLCByZWxhdGlvbl90eXBlOiAncHJlY2VkZXMnIH0sXG4gIF0sXG4gIHZlcnNpb25zOiBbXG4gICAgeyBpZDogMSwgbmFtZTogJ3YxLjAnLCBlZmZlY3RpdmVfZGF0ZTogJzIwMjYtMDItMjgnLCBzdGF0dXM6ICdvcGVuJywgcHJvamVjdF9pZDogMSB9LFxuICBdLFxuICBzdGF0dXNlczogW1xuICAgIHsgaWQ6IDEsIG5hbWU6ICdOZXcnLCBpc19jbG9zZWQ6IGZhbHNlIH0sXG4gICAgeyBpZDogMiwgbmFtZTogJ0luIFByb2dyZXNzJywgaXNfY2xvc2VkOiBmYWxzZSB9LFxuICAgIHsgaWQ6IDMsIG5hbWU6ICdDbG9zZWQnLCBpc19jbG9zZWQ6IHRydWUgfSxcbiAgXSxcbiAgcHJvamVjdDogeyBpZDogMSwgbmFtZTogJ0NhbnZhcyBHYW50dCcgfSxcbiAgcGVybWlzc2lvbnM6IHsgZWRpdGFibGU6IHRydWUsIHZpZXdhYmxlOiB0cnVlIH0sXG59O1xuXG5jb25zdCBjcmVhdGVFZGl0TWV0YSA9ICh0YXNrSWQ6IHN0cmluZywgZGF0YTogTW9ja0RhdGEpID0+IHtcbiAgY29uc3QgdGFzayA9IGRhdGEudGFza3MuZmluZCgodCkgPT4gU3RyaW5nKHQuaWQpID09PSB0YXNrSWQpO1xuICBjb25zdCBjdXJyZW50ID0gdGFzayA/PyBkYXRhLnRhc2tzWzBdO1xuXG4gIHJldHVybiB7XG4gICAgdGFzazoge1xuICAgICAgaWQ6IGN1cnJlbnQuaWQsXG4gICAgICBzdWJqZWN0OiBjdXJyZW50LnN1YmplY3QsXG4gICAgICBhc3NpZ25lZF90b19pZDogY3VycmVudC5hc3NpZ25lZF90b19pZCA/PyBudWxsLFxuICAgICAgc3RhdHVzX2lkOiBjdXJyZW50LnN0YXR1c19pZCxcbiAgICAgIGRvbmVfcmF0aW86IGN1cnJlbnQucmF0aW9fZG9uZSxcbiAgICAgIGR1ZV9kYXRlOiBjdXJyZW50LmR1ZV9kYXRlLFxuICAgICAgc3RhcnRfZGF0ZTogY3VycmVudC5zdGFydF9kYXRlLFxuICAgICAgcHJpb3JpdHlfaWQ6IDEsXG4gICAgICBjYXRlZ29yeV9pZDogbnVsbCxcbiAgICAgIGVzdGltYXRlZF9ob3VyczogOCxcbiAgICAgIHByb2plY3RfaWQ6IGN1cnJlbnQucHJvamVjdF9pZCxcbiAgICAgIHRyYWNrZXJfaWQ6IGN1cnJlbnQudHJhY2tlcl9pZCA/PyAxLFxuICAgICAgZml4ZWRfdmVyc2lvbl9pZDogY3VycmVudC5maXhlZF92ZXJzaW9uX2lkID8/IDEsXG4gICAgICBsb2NrX3ZlcnNpb246IGN1cnJlbnQubG9ja192ZXJzaW9uLFxuICAgIH0sXG4gICAgZWRpdGFibGU6IHtcbiAgICAgIHN1YmplY3Q6IHRydWUsXG4gICAgICBhc3NpZ25lZF90b19pZDogdHJ1ZSxcbiAgICAgIHN0YXR1c19pZDogdHJ1ZSxcbiAgICAgIGRvbmVfcmF0aW86IHRydWUsXG4gICAgICBkdWVfZGF0ZTogdHJ1ZSxcbiAgICAgIHN0YXJ0X2RhdGU6IHRydWUsXG4gICAgICBwcmlvcml0eV9pZDogdHJ1ZSxcbiAgICAgIGNhdGVnb3J5X2lkOiB0cnVlLFxuICAgICAgZXN0aW1hdGVkX2hvdXJzOiB0cnVlLFxuICAgICAgcHJvamVjdF9pZDogdHJ1ZSxcbiAgICAgIHRyYWNrZXJfaWQ6IHRydWUsXG4gICAgICBmaXhlZF92ZXJzaW9uX2lkOiB0cnVlLFxuICAgICAgY3VzdG9tX2ZpZWxkX3ZhbHVlczogdHJ1ZSxcbiAgICB9LFxuICAgIG9wdGlvbnM6IHtcbiAgICAgIHN0YXR1c2VzOiBkYXRhLnN0YXR1c2VzLm1hcCgocykgPT4gKHsgaWQ6IHMuaWQsIG5hbWU6IHMubmFtZSB9KSksXG4gICAgICBhc3NpZ25lZXM6IFtcbiAgICAgICAgeyBpZDogMTAsIG5hbWU6ICdKYW5lIERvZScgfSxcbiAgICAgICAgeyBpZDogMTEsIG5hbWU6ICdKb2huIFNtaXRoJyB9LFxuICAgICAgICB7IGlkOiAxMiwgbmFtZTogJ01hcnkgTWFqb3InIH0sXG4gICAgICBdLFxuICAgICAgcHJpb3JpdGllczogW3sgaWQ6IDEsIG5hbWU6ICdOb3JtYWwnIH1dLFxuICAgICAgY2F0ZWdvcmllczogW10sXG4gICAgICBwcm9qZWN0czogW1xuICAgICAgICB7IGlkOiAxLCBuYW1lOiAnQWxwaGEnIH0sXG4gICAgICAgIHsgaWQ6IDIsIG5hbWU6ICdCZXRhJyB9LFxuICAgICAgXSxcbiAgICAgIHRyYWNrZXJzOiBbeyBpZDogMSwgbmFtZTogJ1Rhc2snIH1dLFxuICAgICAgdmVyc2lvbnM6IFt7IGlkOiAxLCBuYW1lOiAndjEuMCcgfV0sXG4gICAgICBjdXN0b21fZmllbGRzOiBbXSxcbiAgICB9LFxuICAgIGN1c3RvbV9maWVsZF92YWx1ZXM6IHt9LFxuICB9O1xufTtcblxuY29uc3QgaW5jbHVkZVBlcnNpc3RlZEFzc2lnbmVlID0gKFxuICBtZXRhOiBSZXR1cm5UeXBlPHR5cGVvZiBjcmVhdGVFZGl0TWV0YT4sXG4gIGRhdGE6IE1vY2tEYXRhLFxuICB0YXNrSWQ6IHN0cmluZyxcbikgPT4ge1xuICBjb25zdCBwZXJzaXN0ZWRUYXNrID0gZGF0YS50YXNrcy5maW5kKHRhc2sgPT4gU3RyaW5nKHRhc2suaWQpID09PSB0YXNrSWQpO1xuICBpZiAocGVyc2lzdGVkVGFzaz8uYXNzaWduZWRfdG9faWQgPT0gbnVsbCB8fCAhcGVyc2lzdGVkVGFzay5hc3NpZ25lZF90b19uYW1lKSByZXR1cm47XG4gIGlmIChtZXRhLm9wdGlvbnMuYXNzaWduZWVzLnNvbWUob3B0aW9uID0+IG9wdGlvbi5pZCA9PT0gcGVyc2lzdGVkVGFzay5hc3NpZ25lZF90b19pZCkpIHJldHVybjtcblxuICBtZXRhLm9wdGlvbnMuYXNzaWduZWVzID0gW1xuICAgIC4uLm1ldGEub3B0aW9ucy5hc3NpZ25lZXMsXG4gICAgeyBpZDogcGVyc2lzdGVkVGFzay5hc3NpZ25lZF90b19pZCwgbmFtZTogcGVyc2lzdGVkVGFzay5hc3NpZ25lZF90b19uYW1lIH0sXG4gIF07XG59O1xuXG5jb25zdCBjbG9uZURhdGEgPSAoZGF0YTogTW9ja0RhdGEpOiBNb2NrRGF0YSA9PiBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KGRhdGEpKSBhcyBNb2NrRGF0YTtcblxuY29uc3QgcGFyc2VTZWxlY3RlZElkcyA9ICh1cmw6IFVSTCwga2V5OiBzdHJpbmcpOiBzdHJpbmdbXSA9PlxuICB1cmwuc2VhcmNoUGFyYW1zLmdldEFsbChgJHtrZXl9W11gKS5jb25jYXQodXJsLnNlYXJjaFBhcmFtcy5nZXRBbGwoa2V5KSkuZmxhdE1hcCgodmFsdWUpID0+IChcbiAgICB2YWx1ZS5zcGxpdCgvW3wsXS8pLm1hcCgoZW50cnkpID0+IGVudHJ5LnRyaW0oKSkuZmlsdGVyKEJvb2xlYW4pXG4gICkpO1xuXG5jb25zdCBkZXJpdmVJbml0aWFsU3RhdGUgPSAodXJsOiBVUkwsIGRhdGE6IE1vY2tEYXRhKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPT4ge1xuICBjb25zdCBzdGF0dXNJZHMgPSBwYXJzZVNlbGVjdGVkSWRzKHVybCwgJ3N0YXR1c19pZHMnKS5tYXAoTnVtYmVyKS5maWx0ZXIoTnVtYmVyLmlzRmluaXRlKTtcbiAgY29uc3QgcHJvamVjdElkcyA9IHBhcnNlU2VsZWN0ZWRJZHModXJsLCAncHJvamVjdF9pZHMnKS5maWx0ZXIoKGlkKSA9PiBpZCAhPT0gJ25vbmUnICYmIGlkICE9PSAnX25vbmUnKTtcbiAgY29uc3QgcXVlcnlJZCA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdxdWVyeV9pZCcpO1xuICBjb25zdCBtZW1iZXJQcm9qZWN0c09ubHkgPSB1cmwuc2VhcmNoUGFyYW1zLmdldCgnbWVtYmVyX3Byb2plY3RzX29ubHknKSA9PT0gJzEnO1xuXG4gIHJldHVybiB7XG4gICAgLi4uKGRhdGEuaW5pdGlhbF9zdGF0ZSA/PyB7fSksXG4gICAgLi4uKHF1ZXJ5SWQgJiYgL15cXGQrJC8udGVzdChxdWVyeUlkKSA/IHsgcXVlcnlJZDogTnVtYmVyKHF1ZXJ5SWQpIH0gOiB7fSksXG4gICAgLi4uKHN0YXR1c0lkcy5sZW5ndGggPiAwID8geyBzZWxlY3RlZFN0YXR1c0lkczogc3RhdHVzSWRzIH0gOiB7fSksXG4gICAgLi4uKHByb2plY3RJZHMubGVuZ3RoID4gMCA/IHsgc2VsZWN0ZWRQcm9qZWN0SWRzOiBwcm9qZWN0SWRzIH0gOiB7fSksXG4gICAgLi4uKG1lbWJlclByb2plY3RzT25seSA/IHsgbWVtYmVyUHJvamVjdHNPbmx5OiB0cnVlIH0gOiB7fSksXG4gIH07XG59O1xuXG5jb25zdCBmaWx0ZXJCeVF1ZXJ5ID0gKHJvdXRlOiBSb3V0ZSwgZGF0YTogTW9ja0RhdGEpOiBNb2NrRGF0YSA9PiB7XG4gIGNvbnN0IHVybCA9IG5ldyBVUkwocm91dGUucmVxdWVzdCgpLnVybCgpKTtcbiAgY29uc3Qgc2VsZWN0ZWRTdGF0dXNlcyA9IHBhcnNlU2VsZWN0ZWRJZHModXJsLCAnc3RhdHVzX2lkcycpLm1hcCgodikgPT4gTnVtYmVyKHYpKS5maWx0ZXIoTnVtYmVyLmlzRmluaXRlKTtcbiAgY29uc3Qgc2VsZWN0ZWRQcm9qZWN0cyA9IHBhcnNlU2VsZWN0ZWRJZHModXJsLCAncHJvamVjdF9pZHMnKS5maWx0ZXIoKGlkKSA9PiBpZCAhPT0gJ25vbmUnICYmIGlkICE9PSAnX25vbmUnKTtcbiAgY29uc3QgdmlzaWJsZVByb2plY3RJZHMgPSBuZXcgU2V0KHNlbGVjdGVkUHJvamVjdHMpO1xuXG4gIGNvbnN0IHRhc2tzID0gZGF0YS50YXNrcy5maWx0ZXIoKHRhc2spID0+IHtcbiAgICBpZiAoc2VsZWN0ZWRTdGF0dXNlcy5sZW5ndGggPiAwICYmICFzZWxlY3RlZFN0YXR1c2VzLmluY2x1ZGVzKHRhc2suc3RhdHVzX2lkKSkgcmV0dXJuIGZhbHNlO1xuICAgIGlmICh2aXNpYmxlUHJvamVjdElkcy5zaXplID4gMCAmJiAhdmlzaWJsZVByb2plY3RJZHMuaGFzKFN0cmluZyh0YXNrLnByb2plY3RfaWQpKSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xuICB9KTtcblxuICByZXR1cm4ge1xuICAgIC4uLmRhdGEsXG4gICAgdGFza3MsXG4gICAgcmVsYXRpb25zOiBkYXRhLnJlbGF0aW9ucy5maWx0ZXIoKHJlbGF0aW9uKSA9PiB7XG4gICAgICBjb25zdCB0YXNrSWRzID0gbmV3IFNldCh0YXNrcy5tYXAoKHRhc2spID0+IFN0cmluZyh0YXNrLmlkKSkpO1xuICAgICAgcmV0dXJuIHRhc2tJZHMuaGFzKFN0cmluZyhyZWxhdGlvbi5pc3N1ZV9mcm9tX2lkKSkgJiYgdGFza0lkcy5oYXMoU3RyaW5nKHJlbGF0aW9uLmlzc3VlX3RvX2lkKSk7XG4gICAgfSksXG4gICAgaW5pdGlhbF9zdGF0ZTogZGVyaXZlSW5pdGlhbFN0YXRlKHVybCwgZGF0YSksXG4gIH07XG59O1xuXG5jb25zdCBpc1Rhc2tWaXNpYmxlSW5DdXJyZW50UmVxdWVzdCA9IChyb3V0ZTogUm91dGUsIGRhdGE6IE1vY2tEYXRhLCB0YXNrSWQ6IHN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICBjb25zdCBmaWx0ZXJlZCA9IGZpbHRlckJ5UXVlcnkocm91dGUsIGRhdGEpO1xuICByZXR1cm4gZmlsdGVyZWQudGFza3Muc29tZSgodGFzaykgPT4gU3RyaW5nKHRhc2suaWQpID09PSB0YXNrSWQpO1xufTtcblxuY29uc3QgaXNSZWxhdGlvblZpc2libGVJbkN1cnJlbnRSZXF1ZXN0ID0gKHJvdXRlOiBSb3V0ZSwgZGF0YTogTW9ja0RhdGEsIHJlbGF0aW9uSWQ6IHN0cmluZyk6IGJvb2xlYW4gPT4ge1xuICBjb25zdCBmaWx0ZXJlZCA9IGZpbHRlckJ5UXVlcnkocm91dGUsIGRhdGEpO1xuICByZXR1cm4gZmlsdGVyZWQucmVsYXRpb25zLnNvbWUoKHJlbGF0aW9uKSA9PiBTdHJpbmcocmVsYXRpb24uaWQpID09PSByZWxhdGlvbklkKTtcbn07XG5cbmV4cG9ydCBjb25zdCBzZXR1cE1vY2tBcHAgPSBhc3luYyAocGFnZTogUGFnZSwgb3B0aW9ucz86IFNldHVwT3B0aW9ucykgPT4ge1xuICBjb25zdCBkYXRhID0gY2xvbmVEYXRhKG9wdGlvbnM/Lm1vY2tEYXRhID8/IGRlZmF1bHRNb2NrRGF0YSk7XG4gIGNvbnN0IHByZWZlcmVuY2VzID0ge1xuICAgIGdyb3VwQnlQcm9qZWN0OiBmYWxzZSxcbiAgICB2aXNpYmxlQ29sdW1uczogWydpZCcsICdzdWJqZWN0JywgJ3N0YXR1cycsICdhc3NpZ25lZScsICdzdGFydERhdGUnLCAnZHVlRGF0ZScsICdyYXRpb0RvbmUnXSxcbiAgICBzaWRlYmFyV2lkdGg6IDQyMCxcbiAgICB2aWV3cG9ydDoge1xuICAgICAgc2Nyb2xsWDogMCxcbiAgICAgIHNjcm9sbFk6IDAsXG4gICAgfSxcbiAgICAuLi5vcHRpb25zPy5wcmVmZXJlbmNlcyxcbiAgfTtcblxuICBhd2FpdCBwYWdlLmFkZEluaXRTY3JpcHQoKGluaXRpYWxQcmVmZXJlbmNlcykgPT4ge1xuICAgIGlmICghbG9jYWxTdG9yYWdlLmdldEl0ZW0oJ2NhbnZhc0dhbnR0OnByZWZlcmVuY2VzJykpIHtcbiAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKCdjYW52YXNHYW50dDpwcmVmZXJlbmNlcycsIEpTT04uc3RyaW5naWZ5KGluaXRpYWxQcmVmZXJlbmNlcykpO1xuICAgIH1cbiAgICAod2luZG93IGFzIFdpbmRvdyAmIHsgUmVkbWluZUNhbnZhc0dhbnR0PzogdW5rbm93biB9KS5SZWRtaW5lQ2FudmFzR2FudHQgPSB7XG4gICAgICBwcm9qZWN0SWQ6IDEsXG4gICAgICBhcGlCYXNlOiAnL3Byb2plY3RzLzEvY2FudmFzX2dhbnR0JyxcbiAgICAgIHJlZG1pbmVCYXNlOiAnJyxcbiAgICAgIGF1dGhUb2tlbjogJ3Rlc3QtdG9rZW4nLFxuICAgICAgYXBpS2V5OiAndGVzdC1hcGkta2V5JyxcbiAgICAgIHVzZXJJZDogMSxcbiAgICAgIGkxOG46IHtcbiAgICAgICAgZmllbGRfc3ViamVjdDogJ1Rhc2sgTmFtZScsXG4gICAgICAgIGZpZWxkX3N0YXR1czogJ1N0YXR1cycsXG4gICAgICAgIGZpZWxkX2Fzc2lnbmVkX3RvOiAnQXNzaWduZWUnLFxuICAgICAgfSxcbiAgICAgIHNldHRpbmdzOiB7XG4gICAgICAgIGlubGluZV9lZGl0X3N1YmplY3Q6ICcxJyxcbiAgICAgICAgaW5saW5lX2VkaXRfYXNzaWduZWRfdG86ICcxJyxcbiAgICAgICAgaW5saW5lX2VkaXRfc3RhdHVzOiAnMScsXG4gICAgICAgIGlubGluZV9lZGl0X2RvbmVfcmF0aW86ICcxJyxcbiAgICAgICAgaW5saW5lX2VkaXRfZHVlX2RhdGU6ICcxJyxcbiAgICAgICAgaW5saW5lX2VkaXRfc3RhcnRfZGF0ZTogJzEnLFxuICAgICAgICB0ZXN0X21vZGU6ICcxJyxcbiAgICAgIH0sXG4gICAgfTtcbiAgfSwgcHJlZmVyZW5jZXMpO1xuXG4gIGF3YWl0IHBhZ2Uucm91dGUoJyoqL2NhbnZhc19nYW50dC9xdWVyaWVzLmpzb24nLCBhc3luYyAocm91dGUpID0+IHtcbiAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKHtcbiAgICAgIHN0YXR1czogMjAwLFxuICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcXVlcmllczogb3B0aW9ucz8uc2F2ZWRRdWVyaWVzID8/IFtdIH0pLFxuICAgIH0pO1xuICB9KTtcblxuICBhd2FpdCBwYWdlLnJvdXRlKCcqKi9jYW52YXNfZ2FudHQvZGF0YS5qc29uKionLCBhc3luYyAocm91dGUpID0+IHtcbiAgICBjb25zdCBwYXlsb2FkID0gZmlsdGVyQnlRdWVyeShyb3V0ZSwgZGF0YSk7XG4gICAgYXdhaXQgcm91dGUuZnVsZmlsbCh7XG4gICAgICBzdGF0dXM6IDIwMCxcbiAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgYXdhaXQgcGFnZS5yb3V0ZSgnKiovY2FudmFzX2dhbnR0L3Rhc2tzLyovZWRpdF9tZXRhL3ByZXZpZXcuanNvbioqJywgYXN5bmMgKHJvdXRlKSA9PiB7XG4gICAgY29uc3QgdXJsID0gbmV3IFVSTChyb3V0ZS5yZXF1ZXN0KCkudXJsKCkpO1xuICAgIGNvbnN0IHRhc2tJZCA9IHVybC5wYXRobmFtZS5tYXRjaCgvdGFza3NcXC8oXFxkKylcXC9lZGl0X21ldGFcXC9wcmV2aWV3XFwuanNvbiQvKT8uWzFdID8/ICcxMDEnO1xuICAgIGNvbnN0IG1ldGEgPSBjcmVhdGVFZGl0TWV0YSh0YXNrSWQsIGRhdGEpO1xuICAgIGNvbnN0IGJvZHkgPSByb3V0ZS5yZXF1ZXN0KCkucG9zdERhdGFKU09OKCkgYXMgeyB0YXNrPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfTtcbiAgICBjb25zdCBpbnRlbnQgPSBib2R5LnRhc2sgPz8ge307XG4gICAgY29uc3QgdGFyZ2V0UHJvamVjdElkID0gU3RyaW5nKGludGVudC5wcm9qZWN0X2lkID8/IG1ldGEudGFzay5wcm9qZWN0X2lkKTtcbiAgICBjb25zdCB0YXJnZXRUcmFja2VySWQgPSBTdHJpbmcoaW50ZW50LnRyYWNrZXJfaWQgPz8gbWV0YS50YXNrLnRyYWNrZXJfaWQpO1xuICAgIGNvbnN0IHByb2plY3RPcHRpb25zID0gb3B0aW9ucz8uZWRpdE9wdGlvbnNCeVByb2plY3Q/Llt0YXJnZXRQcm9qZWN0SWRdO1xuICAgIG1ldGEub3B0aW9ucy5wcm9qZWN0cyA9IG9wdGlvbnM/LmVkaXRQcm9qZWN0cyA/PyBtZXRhLm9wdGlvbnMucHJvamVjdHM7XG4gICAgbWV0YS5vcHRpb25zLnRyYWNrZXJzID0gcHJvamVjdE9wdGlvbnM/LnRyYWNrZXJzID8/IG9wdGlvbnM/LmVkaXRUcmFja2VycyA/PyBtZXRhLm9wdGlvbnMudHJhY2tlcnM7XG4gICAgbWV0YS5vcHRpb25zLmNhdGVnb3JpZXMgPSBwcm9qZWN0T3B0aW9ucz8uY2F0ZWdvcmllcyA/PyBvcHRpb25zPy5lZGl0Q2F0ZWdvcmllcyA/PyBtZXRhLm9wdGlvbnMuY2F0ZWdvcmllcztcbiAgICBtZXRhLm9wdGlvbnMudmVyc2lvbnMgPSBwcm9qZWN0T3B0aW9ucz8udmVyc2lvbnMgPz8gb3B0aW9ucz8uZWRpdFZlcnNpb25zID8/IG1ldGEub3B0aW9ucy52ZXJzaW9ucztcbiAgICBtZXRhLm9wdGlvbnMuYXNzaWduZWVzID0gcHJvamVjdE9wdGlvbnM/LmFzc2lnbmVlcyA/PyBvcHRpb25zPy5lZGl0QXNzaWduZWVzID8/IG1ldGEub3B0aW9ucy5hc3NpZ25lZXM7XG4gICAgY29uc3QgdHJhY2tlclN0YXR1cyA9IG9wdGlvbnM/LmVkaXRTdGF0dXNCeVRyYWNrZXI/Llt0YXJnZXRUcmFja2VySWRdO1xuICAgIGlmICh0cmFja2VyU3RhdHVzICYmICFtZXRhLm9wdGlvbnMuc3RhdHVzZXMuc29tZShzdGF0dXMgPT4gc3RhdHVzLmlkID09PSB0cmFja2VyU3RhdHVzLmlkKSkge1xuICAgICAgbWV0YS5vcHRpb25zLnN0YXR1c2VzID0gWy4uLm1ldGEub3B0aW9ucy5zdGF0dXNlcywgdHJhY2tlclN0YXR1c107XG4gICAgfVxuICAgIGluY2x1ZGVQZXJzaXN0ZWRBc3NpZ25lZShtZXRhLCBkYXRhLCB0YXNrSWQpO1xuXG4gICAgY29uc3QgbWF0ZXJpYWxpemVkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IE9iamVjdC5mcm9tRW50cmllcyhcbiAgICAgIE9iamVjdC5lbnRyaWVzKGludGVudCkuZmlsdGVyKChbZmllbGRdKSA9PiBmaWVsZCAhPT0gJ2xvY2tfdmVyc2lvbicpLFxuICAgICk7XG4gICAgY29uc3QgcHJvamVjdENoYW5nZWQgPSBOdW1iZXIodGFyZ2V0UHJvamVjdElkKSAhPT0gTnVtYmVyKG1ldGEudGFzay5wcm9qZWN0X2lkKTtcbiAgICBpZiAocHJvamVjdENoYW5nZWQgJiYgbWF0ZXJpYWxpemVkLnRyYWNrZXJfaWQgPT09IHVuZGVmaW5lZCAmJiBtZXRhLm9wdGlvbnMudHJhY2tlcnNbMF0pIHtcbiAgICAgIG1hdGVyaWFsaXplZC50cmFja2VyX2lkID0gbWV0YS5vcHRpb25zLnRyYWNrZXJzWzBdLmlkO1xuICAgIH1cbiAgICBpZiAocHJvamVjdENoYW5nZWQpIHtcbiAgICAgIG1hdGVyaWFsaXplZC5maXhlZF92ZXJzaW9uX2lkID0gbnVsbDtcbiAgICAgIG1hdGVyaWFsaXplZC5jYXRlZ29yeV9pZCA9IG51bGw7XG4gICAgfVxuICAgIGlmIChcbiAgICAgIHRyYWNrZXJTdGF0dXMgJiZcbiAgICAgIGludGVudC50cmFja2VyX2lkICE9PSB1bmRlZmluZWQgJiZcbiAgICAgIGludGVudC5zdGF0dXNfaWQgPT09IHVuZGVmaW5lZCAmJlxuICAgICAgTnVtYmVyKHRhcmdldFRyYWNrZXJJZCkgIT09IE51bWJlcihtZXRhLnRhc2sudHJhY2tlcl9pZClcbiAgICApIHtcbiAgICAgIG1hdGVyaWFsaXplZC5zdGF0dXNfaWQgPSB0cmFja2VyU3RhdHVzLmlkO1xuICAgIH1cbiAgICBjb25zdCByZXNwb25zZU1ldGEgPSBtZXRhIGFzIHR5cGVvZiBtZXRhICYgeyBjYXBhYmlsaXR5X2NvbnRleHQ6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfTtcbiAgICByZXNwb25zZU1ldGEuY2FwYWJpbGl0eV9jb250ZXh0ID0ge1xuICAgICAgdGFza19pZDogTnVtYmVyKHRhc2tJZCksXG4gICAgICBwcm9qZWN0X2lkOiBOdW1iZXIobWF0ZXJpYWxpemVkLnByb2plY3RfaWQgPz8gbWV0YS50YXNrLnByb2plY3RfaWQpLFxuICAgICAgdHJhY2tlcl9pZDogTnVtYmVyKG1hdGVyaWFsaXplZC50cmFja2VyX2lkID8/IG1ldGEudGFzay50cmFja2VyX2lkKSxcbiAgICAgIHN0YXR1c19pZDogTnVtYmVyKG1hdGVyaWFsaXplZC5zdGF0dXNfaWQgPz8gbWV0YS50YXNrLnN0YXR1c19pZCksXG4gICAgfTtcbiAgICBjb25zdCBub3JtYWxpemF0aW9ucyA9IG1hdGVyaWFsaXplZC50cmFja2VyX2lkICE9PSB1bmRlZmluZWQgJiYgaW50ZW50LnRyYWNrZXJfaWQgPT09IHVuZGVmaW5lZFxuICAgICAgPyBbeyBmaWVsZDogJ3RyYWNrZXJfaWQnLCBmcm9tOiBtZXRhLnRhc2sudHJhY2tlcl9pZCwgdG86IG1hdGVyaWFsaXplZC50cmFja2VyX2lkLCBzb3VyY2U6ICdwb2xpY3knIH1dXG4gICAgICA6IFtdO1xuXG4gICAgYXdhaXQgcm91dGUuZnVsZmlsbCh7XG4gICAgICBzdGF0dXM6IDIwMCxcbiAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIC4uLnJlc3BvbnNlTWV0YSxcbiAgICAgICAgZHJhZnRfY29udHJhY3Q6IHtcbiAgICAgICAgICBiYXNlX3JldmlzaW9uOiBOdW1iZXIoaW50ZW50LmxvY2tfdmVyc2lvbiA/PyBtZXRhLnRhc2subG9ja192ZXJzaW9uKSxcbiAgICAgICAgICBtYXRlcmlhbGl6ZWQsXG4gICAgICAgICAgbm9ybWFsaXphdGlvbnMsXG4gICAgICAgICAgdmlvbGF0aW9uczogW10sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgYXdhaXQgcGFnZS5yb3V0ZSgnKiovY2FudmFzX2dhbnR0L3Rhc2tzLyovZWRpdF9tZXRhLmpzb24qKicsIGFzeW5jIChyb3V0ZSkgPT4ge1xuICAgIGNvbnN0IHVybCA9IG5ldyBVUkwocm91dGUucmVxdWVzdCgpLnVybCgpKTtcbiAgICBjb25zdCB0YXNrSWQgPSB1cmwucGF0aG5hbWUubWF0Y2goL3Rhc2tzXFwvKFxcZCspXFwvZWRpdF9tZXRhXFwuanNvbiQvKT8uWzFdID8/ICcxMDEnO1xuICAgIGNvbnN0IG1ldGEgPSBjcmVhdGVFZGl0TWV0YSh0YXNrSWQsIGRhdGEpO1xuICAgIGNvbnN0IHRhcmdldFByb2plY3RJZCA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCd0YXJnZXRfcHJvamVjdF9pZCcpID8/IFN0cmluZyhtZXRhLnRhc2sucHJvamVjdF9pZCk7XG4gICAgY29uc3QgcHJvamVjdE9wdGlvbnMgPSBvcHRpb25zPy5lZGl0T3B0aW9uc0J5UHJvamVjdD8uW3RhcmdldFByb2plY3RJZF07XG4gICAgbWV0YS5vcHRpb25zLnByb2plY3RzID0gb3B0aW9ucz8uZWRpdFByb2plY3RzID8/IG1ldGEub3B0aW9ucy5wcm9qZWN0cztcbiAgICBtZXRhLm9wdGlvbnMudHJhY2tlcnMgPSBwcm9qZWN0T3B0aW9ucz8udHJhY2tlcnMgPz8gb3B0aW9ucz8uZWRpdFRyYWNrZXJzID8/IG1ldGEub3B0aW9ucy50cmFja2VycztcbiAgICBtZXRhLm9wdGlvbnMuY2F0ZWdvcmllcyA9IHByb2plY3RPcHRpb25zPy5jYXRlZ29yaWVzID8/IG9wdGlvbnM/LmVkaXRDYXRlZ29yaWVzID8/IG1ldGEub3B0aW9ucy5jYXRlZ29yaWVzO1xuICAgIG1ldGEub3B0aW9ucy52ZXJzaW9ucyA9IHByb2plY3RPcHRpb25zPy52ZXJzaW9ucyA/PyBvcHRpb25zPy5lZGl0VmVyc2lvbnMgPz8gbWV0YS5vcHRpb25zLnZlcnNpb25zO1xuICAgIG1ldGEub3B0aW9ucy5hc3NpZ25lZXMgPSBwcm9qZWN0T3B0aW9ucz8uYXNzaWduZWVzID8/IG9wdGlvbnM/LmVkaXRBc3NpZ25lZXMgPz8gbWV0YS5vcHRpb25zLmFzc2lnbmVlcztcbiAgICBpbmNsdWRlUGVyc2lzdGVkQXNzaWduZWUobWV0YSwgZGF0YSwgdGFza0lkKTtcbiAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKHtcbiAgICAgIHN0YXR1czogMjAwLFxuICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KG1ldGEpLFxuICAgIH0pO1xuICB9KTtcblxuICBhd2FpdCBwYWdlLnJvdXRlKCcqKi9jYW52YXNfZ2FudHQvdGFza3MvKi5qc29uKionLCBhc3luYyAocm91dGUpID0+IHtcbiAgICBpZiAocm91dGUucmVxdWVzdCgpLm1ldGhvZCgpID09PSAnUEFUQ0gnKSB7XG4gICAgICBjb25zdCB0YXNrSWQgPSByb3V0ZS5yZXF1ZXN0KCkudXJsKCkubWF0Y2goL3Rhc2tzXFwvKFxcZCspXFwuanNvbi8pPy5bMV0gPz8gJyc7XG4gICAgICBjb25zdCBib2R5ID0gcm91dGUucmVxdWVzdCgpLnBvc3REYXRhSlNPTigpO1xuICAgICAgb3B0aW9ucz8ub25QYXRjaFRhc2s/Lihib2R5KTtcblxuICAgICAgaWYgKG9wdGlvbnM/LmZhaWxUYXNrUGF0Y2ggfHwgb3B0aW9ucz8uZmFpbFRhc2tQYXRjaFdoZW4/Lih0YXNrSWQsIGJvZHkpKSB7XG4gICAgICAgIGF3YWl0IHJvdXRlLmZ1bGZpbGwoeyBzdGF0dXM6IDQyMiwgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJywgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1VwZGF0ZSBmYWlsZWQnIH0pIH0pO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHRhc2sgPSBkYXRhLnRhc2tzLmZpbmQoKGVudHJ5KSA9PiBTdHJpbmcoZW50cnkuaWQpID09PSB0YXNrSWQpO1xuICAgICAgY29uc3QgZmllbGRzID0gKGJvZHkgYXMgeyB0YXNrPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSkudGFzayA/PyB7fTtcbiAgICAgIGlmICh0YXNrKSB7XG4gICAgICAgIGNvbnN0IHByZXZpb3VzUHJvamVjdElkID0gdGFzay5wcm9qZWN0X2lkO1xuICAgICAgICBpZiAodHlwZW9mIGZpZWxkcy5zdWJqZWN0ID09PSAnc3RyaW5nJykgdGFzay5zdWJqZWN0ID0gZmllbGRzLnN1YmplY3Q7XG4gICAgICAgIGlmICh0eXBlb2YgZmllbGRzLnN0YXR1c19pZCA9PT0gJ251bWJlcicpIHRhc2suc3RhdHVzX2lkID0gZmllbGRzLnN0YXR1c19pZDtcbiAgICAgICAgaWYgKHR5cGVvZiBmaWVsZHMuZG9uZV9yYXRpbyA9PT0gJ251bWJlcicpIHRhc2sucmF0aW9fZG9uZSA9IGZpZWxkcy5kb25lX3JhdGlvO1xuICAgICAgICBpZiAodHlwZW9mIGZpZWxkcy5wcm9qZWN0X2lkID09PSAnbnVtYmVyJykge1xuICAgICAgICAgIHRhc2sucHJvamVjdF9pZCA9IGZpZWxkcy5wcm9qZWN0X2lkO1xuICAgICAgICAgIGNvbnN0IHByb2plY3QgPSBvcHRpb25zPy5lZGl0UHJvamVjdHM/LmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gZmllbGRzLnByb2plY3RfaWQpO1xuICAgICAgICAgIGlmIChwcm9qZWN0KSB0YXNrLnByb2plY3RfbmFtZSA9IHByb2plY3QubmFtZTtcblxuICAgICAgICAgIGlmIChmaWVsZHMucHJvamVjdF9pZCAhPT0gcHJldmlvdXNQcm9qZWN0SWQpIHtcbiAgICAgICAgICAgIGNvbnN0IHRhcmdldFRyYWNrZXJzID0gb3B0aW9ucz8uZWRpdE9wdGlvbnNCeVByb2plY3Q/LltTdHJpbmcodGFzay5wcm9qZWN0X2lkKV0/LnRyYWNrZXJzID8/IG9wdGlvbnM/LmVkaXRUcmFja2VycyA/PyBbXTtcbiAgICAgICAgICAgIGlmIChmaWVsZHMudHJhY2tlcl9pZCA9PT0gdW5kZWZpbmVkICYmIHRhcmdldFRyYWNrZXJzLmxlbmd0aCA+IDAgJiYgIXRhcmdldFRyYWNrZXJzLnNvbWUoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gdGFzay50cmFja2VyX2lkKSkge1xuICAgICAgICAgICAgICB0YXNrLnRyYWNrZXJfaWQgPSB0YXJnZXRUcmFja2Vyc1swXS5pZDtcbiAgICAgICAgICAgICAgdGFzay50cmFja2VyX25hbWUgPSB0YXJnZXRUcmFja2Vyc1swXS5uYW1lO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGFzay5maXhlZF92ZXJzaW9uX2lkID0gbnVsbDtcbiAgICAgICAgICAgIHRhc2suZml4ZWRfdmVyc2lvbl9uYW1lID0gbnVsbDtcbiAgICAgICAgICAgIHRhc2suY2F0ZWdvcnlfaWQgPSBudWxsO1xuICAgICAgICAgICAgdGFzay5jYXRlZ29yeV9uYW1lID0gbnVsbDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHR5cGVvZiBmaWVsZHMudHJhY2tlcl9pZCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBjb25zdCBwcmV2aW91c1RyYWNrZXJJZCA9IHRhc2sudHJhY2tlcl9pZDtcbiAgICAgICAgICB0YXNrLnRyYWNrZXJfaWQgPSBmaWVsZHMudHJhY2tlcl9pZDtcbiAgICAgICAgICBjb25zdCBwcm9qZWN0VHJhY2tlcnMgPSBvcHRpb25zPy5lZGl0T3B0aW9uc0J5UHJvamVjdD8uW1N0cmluZyh0YXNrLnByb2plY3RfaWQpXT8udHJhY2tlcnM7XG4gICAgICAgICAgY29uc3QgdHJhY2tlciA9IChwcm9qZWN0VHJhY2tlcnMgPz8gb3B0aW9ucz8uZWRpdFRyYWNrZXJzKT8uZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmlkID09PSBmaWVsZHMudHJhY2tlcl9pZCk7XG4gICAgICAgICAgaWYgKHRyYWNrZXIpIHRhc2sudHJhY2tlcl9uYW1lID0gdHJhY2tlci5uYW1lO1xuICAgICAgICAgIGNvbnN0IHRyYWNrZXJTdGF0dXMgPSBvcHRpb25zPy5lZGl0U3RhdHVzQnlUcmFja2VyPy5bU3RyaW5nKGZpZWxkcy50cmFja2VyX2lkKV07XG4gICAgICAgICAgaWYgKHRyYWNrZXJTdGF0dXMgJiYgZmllbGRzLnN0YXR1c19pZCA9PT0gdW5kZWZpbmVkICYmIHByZXZpb3VzVHJhY2tlcklkICE9PSBmaWVsZHMudHJhY2tlcl9pZCkge1xuICAgICAgICAgICAgdGFzay5zdGF0dXNfaWQgPSB0cmFja2VyU3RhdHVzLmlkO1xuICAgICAgICAgICAgdGFzay5zdGF0dXNfbmFtZSA9IHRyYWNrZXJTdGF0dXMubmFtZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZpZWxkcy5maXhlZF92ZXJzaW9uX2lkID09PSBudWxsKSB7XG4gICAgICAgICAgdGFzay5maXhlZF92ZXJzaW9uX2lkID0gbnVsbDtcbiAgICAgICAgICB0YXNrLmZpeGVkX3ZlcnNpb25fbmFtZSA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZpZWxkcy5jYXRlZ29yeV9pZCA9PT0gbnVsbCkge1xuICAgICAgICAgIHRhc2suY2F0ZWdvcnlfaWQgPSBudWxsO1xuICAgICAgICAgIHRhc2suY2F0ZWdvcnlfbmFtZSA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgdGFzay5sb2NrX3ZlcnNpb24gKz0gMTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgcm91dGUuZnVsZmlsbCh7XG4gICAgICAgIHN0YXR1czogMjAwLFxuICAgICAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgc3RhdHVzOiAnb2snLFxuICAgICAgICAgIGNvbXBsZXRlbmVzczogJ3BhcnRpYWwnLFxuICAgICAgICAgIGVudGl0eTogdGFzayxcbiAgICAgICAgICByZXZpc2lvbjogdGFzaz8ubG9ja192ZXJzaW9uID8/IDIsXG4gICAgICAgICAgbG9ja192ZXJzaW9uOiB0YXNrPy5sb2NrX3ZlcnNpb24gPz8gMixcbiAgICAgICAgICB0YXNrX2lkOiB0YXNrSWQsXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYXdhaXQgcm91dGUuZmFsbGJhY2soKTtcbiAgfSk7XG5cbiAgYXdhaXQgcGFnZS5yb3V0ZSgnKiovY2FudmFzX2dhbnR0L3JlbGF0aW9ucy5qc29uKionLCBhc3luYyAocm91dGUpID0+IHtcbiAgICBpZiAocm91dGUucmVxdWVzdCgpLm1ldGhvZCgpID09PSAnUE9TVCcpIHtcbiAgICAgIGNvbnN0IGJvZHkgPSByb3V0ZS5yZXF1ZXN0KCkucG9zdERhdGFKU09OKCk7XG4gICAgICBvcHRpb25zPy5vbkNyZWF0ZVJlbGF0aW9uPy4oYm9keSk7XG4gICAgICBjb25zdCByZWxhdGlvbkJvZHkgPSAoYm9keSBhcyB7IHJlbGF0aW9uPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSkucmVsYXRpb24gPz8ge307XG4gICAgICBjb25zdCBuZXh0SWQgPSBTdHJpbmcoZGF0YS5yZWxhdGlvbnMubGVuZ3RoICsgMTAwKTtcbiAgICAgIGNvbnN0IHJlbGF0aW9uID0ge1xuICAgICAgICBpZDogbmV4dElkLFxuICAgICAgICBpc3N1ZV9mcm9tX2lkOiByZWxhdGlvbkJvZHkuaXNzdWVfZnJvbV9pZCxcbiAgICAgICAgaXNzdWVfdG9faWQ6IHJlbGF0aW9uQm9keS5pc3N1ZV90b19pZCxcbiAgICAgICAgcmVsYXRpb25fdHlwZTogcmVsYXRpb25Cb2R5LnJlbGF0aW9uX3R5cGUsXG4gICAgICAgIC4uLih0eXBlb2YgcmVsYXRpb25Cb2R5LmRlbGF5ID09PSAnbnVtYmVyJyA/IHsgZGVsYXk6IHJlbGF0aW9uQm9keS5kZWxheSB9IDoge30pLFxuICAgICAgfTtcbiAgICAgIGRhdGEucmVsYXRpb25zLnB1c2gocmVsYXRpb24pO1xuICAgICAgYXdhaXQgcm91dGUuZnVsZmlsbCh7IHN0YXR1czogMjAwLCBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLCBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHJlbGF0aW9uIH0pIH0pO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGF3YWl0IHJvdXRlLmZhbGxiYWNrKCk7XG4gIH0pO1xuXG4gIGF3YWl0IHBhZ2Uucm91dGUoJyoqL2NhbnZhc19nYW50dC9yZWxhdGlvbnMvKi5qc29uKionLCBhc3luYyAocm91dGUpID0+IHtcbiAgICBjb25zdCByZWxhdGlvbklkID0gcm91dGUucmVxdWVzdCgpLnVybCgpLm1hdGNoKC9yZWxhdGlvbnNcXC8oW14vXSspXFwuanNvbi8pPy5bMV0gPz8gJyc7XG4gICAgaWYgKG9wdGlvbnM/LmZhaWxSZWxhdGlvbldoZW5IaWRkZW4gJiYgIWlzUmVsYXRpb25WaXNpYmxlSW5DdXJyZW50UmVxdWVzdChyb3V0ZSwgZGF0YSwgcmVsYXRpb25JZCkpIHtcbiAgICAgIGF3YWl0IHJvdXRlLmZ1bGZpbGwoeyBzdGF0dXM6IDQwMywgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJywgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlbGF0aW9uIGlzIG91dHNpZGUgY3VycmVudCB2aWV3JyB9KSB9KTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAocm91dGUucmVxdWVzdCgpLm1ldGhvZCgpID09PSAnUEFUQ0gnKSB7XG4gICAgICBjb25zdCBib2R5ID0gcm91dGUucmVxdWVzdCgpLnBvc3REYXRhSlNPTigpO1xuICAgICAgb3B0aW9ucz8ub25VcGRhdGVSZWxhdGlvbj8uKHJlbGF0aW9uSWQsIGJvZHkpO1xuICAgICAgY29uc3QgcmVsYXRpb24gPSBkYXRhLnJlbGF0aW9ucy5maW5kKChlbnRyeSkgPT4gU3RyaW5nKGVudHJ5LmlkKSA9PT0gcmVsYXRpb25JZCk7XG4gICAgICBjb25zdCByZWxhdGlvbkJvZHkgPSAoYm9keSBhcyB7IHJlbGF0aW9uPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSkucmVsYXRpb24gPz8ge307XG4gICAgICBpZiAocmVsYXRpb24pIHtcbiAgICAgICAgcmVsYXRpb24ucmVsYXRpb25fdHlwZSA9IHJlbGF0aW9uQm9keS5yZWxhdGlvbl90eXBlID8/IHJlbGF0aW9uLnJlbGF0aW9uX3R5cGU7XG4gICAgICAgIGlmICh0eXBlb2YgcmVsYXRpb25Cb2R5LmRlbGF5ID09PSAnbnVtYmVyJykgcmVsYXRpb24uZGVsYXkgPSByZWxhdGlvbkJvZHkuZGVsYXk7XG4gICAgICB9XG4gICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgcmVsYXRpb24gfSkgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHJvdXRlLnJlcXVlc3QoKS5tZXRob2QoKSA9PT0gJ0RFTEVURScpIHtcbiAgICAgIG9wdGlvbnM/Lm9uRGVsZXRlUmVsYXRpb24/LihyZWxhdGlvbklkKTtcbiAgICAgIGRhdGEucmVsYXRpb25zID0gZGF0YS5yZWxhdGlvbnMuZmlsdGVyKChlbnRyeSkgPT4gU3RyaW5nKGVudHJ5LmlkKSAhPT0gcmVsYXRpb25JZCk7XG4gICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiAyMDAsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6ICd7fScgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYXdhaXQgcm91dGUuZmFsbGJhY2soKTtcbiAgfSk7XG5cbiAgYXdhaXQgcGFnZS5yb3V0ZSgnKiovY2FudmFzX2dhbnR0L3N1YnRhc2tzL2J1bGsuanNvbioqJywgYXN5bmMgKHJvdXRlKSA9PiB7XG4gICAgaWYgKHJvdXRlLnJlcXVlc3QoKS5tZXRob2QoKSA9PT0gJ1BPU1QnKSB7XG4gICAgICBjb25zdCBib2R5ID0gcm91dGUucmVxdWVzdCgpLnBvc3REYXRhSlNPTigpO1xuICAgICAgb3B0aW9ucz8ub25CdWxrQ3JlYXRlU3VidGFza3M/Lihib2R5KTtcbiAgICAgIGNvbnN0IHBhcmVudElkID0gU3RyaW5nKChib2R5IGFzIHsgcGFyZW50X2lzc3VlX2lkPzogdW5rbm93biB9KS5wYXJlbnRfaXNzdWVfaWQgPz8gJycpO1xuICAgICAgaWYgKG9wdGlvbnM/LmZhaWxCdWxrQ3JlYXRlV2hlblBhcmVudEhpZGRlbiAmJiAhaXNUYXNrVmlzaWJsZUluQ3VycmVudFJlcXVlc3Qocm91dGUsIGRhdGEsIHBhcmVudElkKSkge1xuICAgICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKHsgc3RhdHVzOiA0MDMsIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdQYXJlbnQgaXMgb3V0c2lkZSBjdXJyZW50IHZpZXcnIH0pIH0pO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCBzdWJqZWN0cyA9IEFycmF5LmlzQXJyYXkoKGJvZHkgYXMgeyBzdWJqZWN0cz86IHVua25vd24gfSkuc3ViamVjdHMpID8gKGJvZHkgYXMgeyBzdWJqZWN0czogc3RyaW5nW10gfSkuc3ViamVjdHMgOiBbXTtcbiAgICAgIGF3YWl0IHJvdXRlLmZ1bGZpbGwoe1xuICAgICAgICBzdGF0dXM6IDIwMCxcbiAgICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIHN0YXR1czogJ29rJyxcbiAgICAgICAgICBzdWNjZXNzX2NvdW50OiBzdWJqZWN0cy5sZW5ndGgsXG4gICAgICAgICAgZmFpbF9jb3VudDogMCxcbiAgICAgICAgICByZXN1bHRzOiBzdWJqZWN0cy5tYXAoKHN1YmplY3QsIGluZGV4KSA9PiAoeyBzdGF0dXM6ICdvaycsIHN1YmplY3QsIGlzc3VlX2lkOiA5MDAgKyBpbmRleCB9KSksXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgYXdhaXQgcm91dGUuZmFsbGJhY2soKTtcbiAgfSk7XG59O1xuXG5leHBvcnQgY29uc3Qgd2FpdEZvckluaXRpYWxSZW5kZXIgPSBhc3luYyAocGFnZTogUGFnZSkgPT4ge1xuICBhd2FpdCBwYWdlLmdvdG8oJy8nKTtcbiAgYXdhaXQgcGFnZS5nZXRCeVRlc3RJZCgnY2VsbC0xMDEtc3ViamVjdCcpLndhaXRGb3IoeyBzdGF0ZTogJ3Zpc2libGUnIH0pO1xufTtcblxuZXhwb3J0IHsgZGVmYXVsdE1vY2tEYXRhIH07XG4i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LENBQUM7TUFDdEYsSUFBSTlOLE9BQU8sYUFBUEEsT0FBTyxlQUFQQSxPQUFPLENBQUVrTyw4QkFBOEIsSUFBSSxDQUFDdkssNkJBQTZCLENBQUNiLEtBQUssRUFBRTdELElBQUksRUFBRStPLFFBQVEsQ0FBQyxFQUFFO1FBQ3BHLE1BQU1sTCxLQUFLLENBQUNzRCxPQUFPLENBQUM7VUFBRTNILE1BQU0sRUFBRSxHQUFHO1VBQUU0SCxXQUFXLEVBQUUsa0JBQWtCO1VBQUVDLElBQUksRUFBRXZGLElBQUksQ0FBQ0UsU0FBUyxDQUFDO1lBQUVzSyxLQUFLLEVBQUU7VUFBaUMsQ0FBQztRQUFFLENBQUMsQ0FBQztRQUN4STtNQUNGO01BQ0EsTUFBTTRDLFFBQVEsR0FBR0MsS0FBSyxDQUFDQyxPQUFPLENBQUUvSCxJQUFJLENBQTRCNkgsUUFBUSxDQUFDLEdBQUk3SCxJQUFJLENBQTRCNkgsUUFBUSxHQUFHLEVBQUU7TUFDMUgsTUFBTXJMLEtBQUssQ0FBQ3NELE9BQU8sQ0FBQztRQUNsQjNILE1BQU0sRUFBRSxHQUFHO1FBQ1g0SCxXQUFXLEVBQUUsa0JBQWtCO1FBQy9CQyxJQUFJLEVBQUV2RixJQUFJLENBQUNFLFNBQVMsQ0FBQztVQUNuQnhDLE1BQU0sRUFBRSxJQUFJO1VBQ1o2UCxhQUFhLEVBQUVILFFBQVEsQ0FBQ3pMLE1BQU07VUFDOUI2TCxVQUFVLEVBQUUsQ0FBQztVQUNiQyxPQUFPLEVBQUVMLFFBQVEsQ0FBQ2xPLEdBQUcsQ0FBQyxDQUFDL0MsT0FBTyxFQUFFdVIsS0FBSyxNQUFNO1lBQUVoUSxNQUFNLEVBQUUsSUFBSTtZQUFFdkIsT0FBTztZQUFFd1IsUUFBUSxFQUFFLEdBQUcsR0FBR0Q7VUFBTSxDQUFDLENBQUM7UUFDOUYsQ0FBQztNQUNILENBQUMsQ0FBQztNQUNGO0lBQ0Y7SUFFQSxNQUFNM0wsS0FBSyxDQUFDOEosUUFBUSxDQUFDLENBQUM7RUFDeEIsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELE9BQU8sTUFBTStCLG9CQUFvQixHQUFHLE1BQU8zSyxJQUFVLElBQUs7RUFDeEQsTUFBTUEsSUFBSSxDQUFDNEssSUFBSSxDQUFDLEdBQUcsQ0FBQztFQUNwQixNQUFNNUssSUFBSSxDQUFDNkssV0FBVyxDQUFDLGtCQUFrQixDQUFDLENBQUNDLE9BQU8sQ0FBQztJQUFFQyxLQUFLLEVBQUU7RUFBVSxDQUFDLENBQUM7QUFDMUUsQ0FBQztBQUVELFNBQVNoUyxlQUFlIiwiaWdub3JlTGlzdCI6W119