'use strict';
// OpenAPI 3.0.3 description of the Lost-and-Found API. This module is the single source of truth:
//  - served at GET /api/openapi.json,
//  - exported to docs/w17/openapi.yaml by scripts/gen-openapi.js,
//  - checked against the real routes and real responses by test/contract.test.js.
const CATEGORIES = ['electronics', 'wallet', 'keys', 'bag', 'clothing', 'id-card', 'books', 'other'];
const ROLES = ['student', 'employee', 'security', 'custodian'];
const idPattern = (p) => ({ type: 'string', pattern: `^${p}-\\d{4,}$` });
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const resp = (n) => ({ $ref: `#/components/responses/${n}` });
const json = (schema) => ({ 'application/json': { schema } });
const ok = (description, schema) => ({ description, content: json(schema) });
const arr = (schema) => ({ type: 'array', items: schema });
const bearer = [{ bearerAuth: [] }];
const idParam = (name, prefix, description) => ({ name, in: 'path', required: true, description, schema: idPattern(prefix) });
const paging = [
  { name: 'limit', in: 'query', description: 'Page size, 1-500 (default 200). Invalid values fall back to the default.', schema: { type: 'integer', minimum: 1, maximum: 500, default: 200 } },
  { name: 'offset', in: 'query', description: 'Number of items to skip (default 0). Invalid values fall back to 0.', schema: { type: 'integer', minimum: 0, default: 0 } },
];
const common = { 401: resp('Unauthorized'), 429: resp('RateLimited'), 500: resp('ServerError') };
const staffOnly = { 403: resp('Forbidden') };

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Campus Lost-and-Found Matching API',
    version: '0.17.0',
    description: [
      'Backend for the Lost-and-Found Matching System (Project 18, University of La Salette). Controlled data only.',
      '',
      '**Workflow.** A user reports a lost item; staff report found items; the API proposes candidate matches and notifies the owner;',
      'a staff member (never the owner) verifies ownership and records the proof; the custodian releases the item and both reports close.',
      '',
      '**Authentication.** `POST /api/auth/login` returns a short-lived signed token (default 15 minutes). Send it as `Authorization: Bearer <token>`.',
      'The role is taken only from the verified token. Roles: student, employee, security, custodian. Security and custodian are "staff".',
      '',
      '**Errors.** Every error uses the envelope `{"error": {"code", "message", "details?"}}`. 401 = not signed in, 403 = role not allowed, 404 = not found (also used',
      'for other people\'s reports so ids cannot be probed), 409 = wrong state or duplicate, 422 = validation (field messages in `details`), 429 = rate limited or account locked.',
      '',
      '**Durability.** A 2xx response to a state-changing request is sent only after the change is safely on disk.',
    ].join('\n'),
  },
  servers: [{ url: 'https://localhost:3000', description: 'Local development (self-signed certificate)' }, { url: 'http://localhost:3000', description: 'Local development without TLS (never use in production)' }],
  tags: [
    { name: 'Auth', description: 'Sign in, identity, sign out' }, { name: 'Reports', description: 'Lost and found reports' },
    { name: 'Matches', description: 'Candidate matches, verification and release' }, { name: 'Notifications', description: 'Match notifications' },
    { name: 'Manual queue', description: 'Items that need a human: failed notifications, disposal reviews' }, { name: 'Operations', description: 'Health, metrics, logs, scheduled jobs' },
  ],
  paths: {
    '/health': { get: { tags: ['Operations'], summary: 'Liveness probe', description: 'The process is running. Public.', security: [], 'x-roles': ['anonymous'], responses: { 200: ok('Alive', ref('Health')) } } },
    '/ready': { get: { tags: ['Operations'], summary: 'Readiness probe', description: '200 when the API can accept work; 503 when shutting down or when the last write to storage failed. Public.', security: [], 'x-roles': ['anonymous'], responses: { 200: ok('Ready', ref('Ready')), 503: { description: 'Not ready', content: json(ref('NotReady')) } } } },
    '/api/openapi.json': { get: { tags: ['Operations'], summary: 'This document', security: [], 'x-roles': ['anonymous'], responses: { 200: { description: 'The OpenAPI document', content: json({ type: 'object' }) } } } },
    '/api/auth/login': { post: { tags: ['Auth'], summary: 'Sign in', description: 'Unknown user and wrong password give the same 401. After 5 failed attempts an account is locked for 15 minutes (429 ACCOUNT_LOCKED), even for the right password.', security: [], 'x-roles': ['anonymous'],
      requestBody: { required: true, content: json(ref('LoginRequest')) },
      responses: { 200: ok('Signed in', ref('LoginResponse')), 401: { description: 'INVALID_CREDENTIALS', content: json(ref('Error')) }, 422: resp('ValidationFailed'), 429: resp('RateLimited'), 400: resp('BadRequest'), 413: resp('PayloadTooLarge'), 500: resp('ServerError') } } },
    '/api/auth/me': { get: { tags: ['Auth'], summary: 'Who am I', security: bearer, 'x-roles': ROLES, responses: { 200: ok('Identity from the token', ref('Me')), ...common } } },
    '/api/auth/logout': { post: { tags: ['Auth'], summary: 'Sign out (revoke this token)', security: bearer, 'x-roles': ROLES, responses: { 204: { description: 'Token revoked' }, ...common } } },
    '/api/reports': {
      get: { tags: ['Reports'], summary: 'List reports', description: 'Staff see all reports; everyone else sees only their own.', security: bearer, 'x-roles': ROLES, parameters: paging, responses: { 200: ok('Reports', arr(ref('Report'))), ...common } },
      post: { tags: ['Reports'], summary: 'Create a lost or found report', description: 'Validates every field, rejects duplicates by the same reporter, runs matching and sends match notifications before responding.', security: bearer, 'x-roles': ROLES,
        requestBody: { required: true, content: json(ref('ReportInput')) },
        responses: { 201: ok('Report created, with any candidate matches found', ref('ReportCreated')), 409: { description: 'DUPLICATE_REPORT (details.existingId names the original)', content: json(ref('Error')) }, 422: resp('ValidationFailed'), 400: resp('BadRequest'), 413: resp('PayloadTooLarge'), ...common } },
    },
    '/api/reports/{id}': { get: { tags: ['Reports'], summary: 'Get one report', description: 'Non-staff users receive 404 for reports they do not own.', security: bearer, 'x-roles': ROLES, parameters: [idParam('id', 'R', 'Report id, e.g. R-0001')], responses: { 200: ok('The report', ref('Report')), 404: resp('NotFound'), ...common } } },
    '/api/matches': { get: { tags: ['Matches'], summary: 'List candidate matches', description: 'Staff: every match with both item summaries. Others: only matches for their own lost reports, with their own item only (no found-item id or details, no finder, verifier or note).', security: bearer, 'x-roles': ROLES, parameters: paging,
      responses: { 200: ok('Matches', arr({ oneOf: [ref('StaffMatch'), ref('ClaimantMatch')] })), ...common } } },
    '/api/matches/{id}/verify': { post: { tags: ['Matches'], summary: 'Verify ownership or refuse the claim', description: 'Staff only, and never for an item the caller reported lost (CONFLICT_OF_INTEREST). A note of 5-200 characters (the proof checked, or the reason for refusing) is required and recorded.', security: bearer, 'x-roles': ['security', 'custodian'], parameters: [idParam('id', 'M', 'Match id, e.g. M-0003')],
      requestBody: { required: true, content: json(ref('VerifyRequest')) },
      responses: { 200: ok('Match after the decision (verified or rejected)', ref('Match')), 403: resp('Forbidden'), 404: resp('NotFound'), 409: { description: 'INVALID_STATE (not a candidate) or ITEM_UNAVAILABLE (a report is no longer open)', content: json(ref('Error')) }, 422: resp('ValidationFailed'), 400: resp('BadRequest'), 413: resp('PayloadTooLarge'), 401: resp('Unauthorized'), 429: resp('RateLimited'), 500: resp('ServerError') } } },
    '/api/matches/{id}/release': { post: { tags: ['Matches'], summary: 'Release the item to the verified owner', description: 'Only a verified match can be released. Both reports close and competing matches are withdrawn. An item can never be released to two people.', security: bearer, 'x-roles': ['security', 'custodian'], parameters: [idParam('id', 'M', 'Match id')],
      responses: { 200: ok('Released match', ref('Match')), 403: resp('Forbidden'), 404: resp('NotFound'), 409: { description: 'INVALID_STATE (not verified) or ITEM_UNAVAILABLE', content: json(ref('Error')) }, ...common } } },
    '/api/notifications': { get: { tags: ['Notifications'], summary: 'List notifications', description: 'Staff see all; others see their own (without internal simulation fields).', security: bearer, 'x-roles': ROLES, parameters: paging, responses: { 200: ok('Notifications', arr(ref('Notification'))), ...common } } },
    '/api/manual-queue': { get: { tags: ['Manual queue'], summary: 'List items needing human action', security: bearer, 'x-roles': ['security', 'custodian'], parameters: paging, responses: { 200: ok('Queue items', arr(ref('ManualQueueItem'))), 403: resp('Forbidden'), ...common } } },
    '/api/manual-queue/{id}/resolve': { post: { tags: ['Manual queue'], summary: 'Resolve a queue item', description: 'For a disposal review, `dispose: true` marks the found item as disposed.', security: bearer, 'x-roles': ['security', 'custodian'], parameters: [idParam('id', 'MQ', 'Queue item id, e.g. MQ-0004')],
      requestBody: { required: false, content: json(ref('ResolveRequest')) },
      responses: { 200: ok('Resolved item', ref('ManualQueueItem')), 403: resp('Forbidden'), 404: resp('NotFound'), 409: resp('Conflict'), 400: resp('BadRequest'), 413: resp('PayloadTooLarge'), 401: resp('Unauthorized'), 429: resp('RateLimited'), 500: resp('ServerError') } } },
    '/api/manual-queue/{id}/retry-notification': { post: { tags: ['Manual queue'], summary: 'Re-send a failed notification', description: 'Only for a notification_failure item whose notification has finally failed. Concurrent re-sends get 409 IN_PROGRESS.', security: bearer, 'x-roles': ['security', 'custodian'], parameters: [idParam('id', 'MQ', 'Queue item id')],
      responses: { 200: ok('Result of the re-send', ref('RetryResult')), 403: resp('Forbidden'), 404: resp('NotFound'), 409: resp('Conflict'), ...common } } },
    '/api/jobs/aging': { post: { tags: ['Operations'], summary: 'Run the aging job now (custodian)', description: 'Raises a reminder for found items unclaimed for 30 days and a disposal review at 90 days; each only once. The `now` override exists for testing and is refused (403) in production.', security: bearer, 'x-roles': ['custodian'],
      requestBody: { required: false, content: json(ref('JobRequest')) },
      responses: { 200: ok('Items raised by this run', ref('JobResult')), 403: resp('Forbidden'), 422: resp('ValidationFailed'), 400: resp('BadRequest'), 413: resp('PayloadTooLarge'), 401: resp('Unauthorized'), 429: resp('RateLimited'), 500: resp('ServerError') } } },
    '/api/metrics': { get: { tags: ['Operations'], summary: 'Operational metrics (staff)', description: 'Request counts, per-route latency percentiles, process and event-loop health. Contains no tokens or personal data. Pass `reset=1` to reset the event-loop histogram.', security: bearer, 'x-roles': ['security', 'custodian'],
      parameters: [{ name: 'reset', in: 'query', schema: { type: 'string', enum: ['1'] }, description: 'Reset the event-loop delay histogram after reading' }],
      responses: { 200: ok('Metrics snapshot', ref('Metrics')), 403: resp('Forbidden'), ...common } } },
    '/api/logs': { get: { tags: ['Operations'], summary: 'Recent structured log entries (staff)', description: 'Passwords, tokens and report text are never logged.', security: bearer, 'x-roles': ['security', 'custodian'],
      parameters: [{ name: 'n', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 }, description: 'How many recent entries (clamped to 1-500)' }],
      responses: { 200: ok('Log entries', arr(ref('LogEntry'))), 403: resp('Forbidden'), ...common } } },
    '/api/audit': { get: { tags: ['Operations'], summary: 'Audit trail of state changes (staff)', security: bearer, 'x-roles': ['security', 'custodian'], responses: { 200: ok('Audit entries', arr(ref('AuditEntry'))), 403: resp('Forbidden'), ...common } } },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token from POST /api/auth/login. HS256, 15-minute lifetime, revoked on logout.' } },
    responses: {
      Unauthorized: { description: 'Missing, malformed, expired, forged or revoked token (code UNAUTHENTICATED). Header `WWW-Authenticate: Bearer`.', content: json(ref('Error')) },
      Forbidden: { description: 'Signed in, but the role is not permitted (FORBIDDEN) or the caller has a conflict of interest (CONFLICT_OF_INTEREST).', content: json(ref('Error')) },
      NotFound: { description: 'NOT_FOUND', content: json(ref('Error')) },
      Conflict: { description: 'INVALID_STATE, IN_PROGRESS, ITEM_UNAVAILABLE or DUPLICATE_REPORT', content: json(ref('Error')) },
      ValidationFailed: { description: 'VALIDATION_FAILED; field messages in error.details', content: json(ref('Error')) },
      BadRequest: { description: 'BAD_JSON (malformed JSON body)', content: json(ref('Error')) },
      PayloadTooLarge: { description: 'PAYLOAD_TOO_LARGE (body over 10 KB)', content: json(ref('Error')) },
      RateLimited: { description: 'RATE_LIMITED or ACCOUNT_LOCKED', content: json(ref('Error')) },
      ServerError: { description: 'INTERNAL. Generic message only: no stack trace or internal detail.', content: json(ref('Error')) },
    },
    schemas: {
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string', example: 'VALIDATION_FAILED' }, message: { type: 'string' }, details: { type: 'object', nullable: true, additionalProperties: true } } } } },
      Health: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } } },
      Ready: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ready'] } } },
      NotReady: { type: 'object', required: ['status', 'reason'], properties: { status: { type: 'string', enum: ['not_ready'] }, reason: { type: 'string', enum: ['shutting_down', 'storage_unavailable'] } } },
      LoginRequest: { type: 'object', required: ['userId', 'password'], properties: { userId: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 128 } } },
      LoginResponse: { type: 'object', required: ['token', 'user', 'expiresIn'], properties: { token: { type: 'string' }, user: { type: 'object', required: ['id', 'role'], properties: { id: { type: 'string' }, role: { type: 'string', enum: ROLES } } }, expiresIn: { type: 'integer', description: 'Seconds' } } },
      Me: { type: 'object', required: ['id', 'role', 'exp'], properties: { id: { type: 'string' }, role: { type: 'string', enum: ROLES }, exp: { type: 'integer', description: 'Expiry, Unix seconds' } } },
      ReportInput: { type: 'object', required: ['type', 'category', 'description', 'location', 'eventDate'], properties: {
        type: { type: 'string', enum: ['lost', 'found'] }, category: { type: 'string', enum: CATEGORIES },
        description: { type: 'string', minLength: 5, maxLength: 300, description: 'Text characters only (control characters rejected)' },
        location: { type: 'string', minLength: 2, maxLength: 100 },
        eventDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'A real calendar day, at most 730 days ago and not later than the next calendar day after UTC today' },
        simulateDelivery: { type: 'string', enum: ['ok', 'transient', 'permanent'], description: 'Development only: simulates the notification outcome. Ignored in production.' } } },
      Report: { type: 'object', required: ['id', 'type', 'category', 'description', 'location', 'eventDate', 'reporterId', 'status', 'createdAt', 'remindedAt', 'disposalFlagged'], properties: {
        id: idPattern('R'), type: { type: 'string', enum: ['lost', 'found'] }, category: { type: 'string', enum: CATEGORIES }, description: { type: 'string' }, location: { type: 'string' },
        eventDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, reporterId: { type: 'string' }, status: { type: 'string', enum: ['open', 'closed', 'disposed'] },
        createdAt: { type: 'string', format: 'date-time' }, remindedAt: { type: 'string', format: 'date-time', nullable: true }, disposalFlagged: { type: 'boolean' } } },
      ReportCreated: { type: 'object', required: ['report', 'matches'], properties: { report: ref('Report'), matches: arr(ref('Match')) } },
      ItemSummary: { type: 'object', nullable: true, required: ['id', 'category', 'description', 'location', 'eventDate', 'status'], properties: {
        id: idPattern('R'), category: { type: 'string', enum: CATEGORIES }, description: { type: 'string' }, location: { type: 'string' }, eventDate: { type: 'string' }, status: { type: 'string', enum: ['open', 'closed', 'disposed'] },
        reporterId: { type: 'string', description: 'Present for staff only' } } },
      Match: { type: 'object', required: ['id', 'lostId', 'foundId', 'score', 'status', 'createdAt', 'verifiedBy', 'releasedTo'], properties: {
        id: idPattern('M'), lostId: idPattern('R'), foundId: idPattern('R'), score: { type: 'integer', minimum: 0, maximum: 100 },
        status: { type: 'string', enum: ['candidate', 'verified', 'released', 'rejected', 'withdrawn'] }, createdAt: { type: 'string', format: 'date-time' },
        verifiedBy: { type: 'string', nullable: true }, releasedTo: { type: 'string', nullable: true }, note: { type: 'string', description: 'Proof checked or reason for refusing' } } },
      StaffMatch: { allOf: [ref('Match'), { type: 'object', required: ['lost', 'found'], properties: { lost: ref('ItemSummary'), found: ref('ItemSummary') } }] },
      ClaimantMatch: { type: 'object', required: ['id', 'lostId', 'score', 'status', 'createdAt', 'lost'], additionalProperties: false, properties: {
        id: idPattern('M'), lostId: idPattern('R'), score: { type: 'integer' }, status: { type: 'string', enum: ['candidate', 'verified', 'released', 'rejected', 'withdrawn'] }, createdAt: { type: 'string', format: 'date-time' }, lost: ref('ItemSummary') } },
      VerifyRequest: { type: 'object', required: ['ownershipConfirmed', 'note'], properties: { ownershipConfirmed: { type: 'boolean' }, note: { type: 'string', minLength: 5, maxLength: 200, description: 'The proof checked (when confirming) or the reason (when refusing)' } } },
      Notification: { type: 'object', required: ['id', 'matchId', 'recipientId', 'kind', 'status', 'attempts', 'lastError'], properties: {
        id: idPattern('N'), matchId: { type: 'string', nullable: true }, recipientId: { type: 'string' }, kind: { type: 'string', enum: ['candidate_match', 'aging_reminder'] },
        status: { type: 'string', enum: ['queued', 'sending', 'delivered', 'failed_permanent'] }, attempts: { type: 'integer' }, lastError: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' }, refId: { type: 'string' }, sim: { type: 'string', description: 'Staff only; development simulation field' } } },
      ManualQueueItem: { type: 'object', required: ['id', 'kind', 'refId', 'reason', 'status', 'createdAt'], properties: {
        id: idPattern('MQ'), kind: { type: 'string', enum: ['notification_failure', 'disposal_review'] }, refId: { type: 'string' }, matchId: { type: 'string', nullable: true }, reason: { type: 'string' },
        status: { type: 'string', enum: ['open', 'resolved'] }, createdAt: { type: 'string', format: 'date-time' }, resolvedBy: { type: 'string' }, resolution: { type: 'string' } } },
      ResolveRequest: { type: 'object', properties: { resolution: { type: 'string', maxLength: 200 }, dispose: { type: 'boolean', description: 'For disposal_review items: mark the found item disposed' } } },
      RetryResult: { type: 'object', required: ['notification', 'queueItem'], properties: { notification: ref('Notification'), queueItem: ref('ManualQueueItem') } },
      JobRequest: { type: 'object', properties: { now: { type: 'string', format: 'date-time', description: 'Testing only; refused in production' } } },
      JobResult: { type: 'object', required: ['reminded', 'disposalFlagged'], properties: { reminded: { type: 'array', items: { type: 'string' } }, disposalFlagged: { type: 'array', items: { type: 'string' } } } },
      AuditEntry: { type: 'object', required: ['ts', 'actor', 'action', 'refId'], additionalProperties: true, properties: { ts: { type: 'string', format: 'date-time' }, actor: { type: 'string' }, action: { type: 'string' }, refId: { type: 'string' } } },
      LogEntry: { type: 'object', required: ['ts', 'level', 'event'], additionalProperties: true, properties: { ts: { type: 'string', format: 'date-time' }, level: { type: 'string', enum: ['info', 'warn', 'error'] }, event: { type: 'string' } } },
      Metrics: { type: 'object', required: ['uptimeSec', 'requests', 'routes', 'process', 'eventLoop'], properties: {
        uptimeSec: { type: 'integer' },
        requests: { type: 'object', required: ['total', 'inFlight', 'byStatus'], properties: { total: { type: 'integer' }, inFlight: { type: 'integer' }, byStatus: { type: 'object', additionalProperties: { type: 'integer' } } } },
        routes: arr({ type: 'object', required: ['route', 'count', 'avgMs', 'maxMs', 'p50Ms', 'p95Ms', 'p99Ms', 'clientErrors', 'serverErrors'], properties: { route: { type: 'string' }, count: { type: 'integer' }, avgMs: { type: 'number' }, maxMs: { type: 'number' }, p50Ms: { type: 'number' }, p95Ms: { type: 'number' }, p99Ms: { type: 'number' }, clientErrors: { type: 'integer' }, serverErrors: { type: 'integer' } } }),
        process: { type: 'object', required: ['rssMB', 'heapUsedMB', 'cpuPercentSinceLast'], properties: { rssMB: { type: 'number' }, heapUsedMB: { type: 'number' }, cpuPercentSinceLast: { type: 'number' } } },
        eventLoop: { type: 'object', required: ['meanMs', 'p99Ms', 'maxMs'], properties: { meanMs: { type: 'number' }, p99Ms: { type: 'number' }, maxMs: { type: 'number' } } } } },
    },
  },
};
module.exports = spec;
