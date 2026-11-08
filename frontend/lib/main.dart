import 'package:flutter/material.dart';
import 'api.dart';

void main() => runApp(const LostFoundApp());

class LostFoundApp extends StatelessWidget {
  const LostFoundApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Campus Lost & Found',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(colorSchemeSeed: const Color(0xFF1B5E8C), useMaterial3: true),
        home: const SignInScreen(),
      );
}

/// Evidence/demo builds only: flutter build web --dart-define=DEMO_TOOLS=true (UAT finding: the simulator was visible to every user).
const bool demoTools = bool.fromEnvironment('DEMO_TOOLS');
const roles = ['student', 'employee', 'security', 'custodian'];
const categories = ['electronics', 'wallet', 'keys', 'bag', 'clothing', 'id-card', 'books', 'other'];

/// Week 14: real sign-in. The server returns a signed, short-lived token. The role shown here is only
/// a display value - every request is authorised again on the server from the token.
class SignInScreen extends StatefulWidget {
  final String? notice;
  const SignInScreen({super.key, this.notice});
  @override
  State<SignInScreen> createState() => _SignInState();
}

class _SignInState extends State<SignInScreen> {
  final _form = GlobalKey<FormState>();
  final _id = TextEditingController();
  final _pw = TextEditingController();
  bool _busy = false;
  bool _show = false;
  String? _error;

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = await Api.login(_id.text.trim(), _pw.text);
      _pw.clear();
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => HomeShell(api: api)));
    } on ApiError catch (e) {
      setState(() => _error = e.status == 429 ? 'Too many attempts. Please wait and try again later.' : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Card(
              margin: const EdgeInsets.all(16),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Form(
                  key: _form,
                  child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Text('Campus Lost & Found', style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 4),
                    const Text('Sign in (prototype with controlled test accounts)'),
                    if (widget.notice != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(widget.notice!, style: TextStyle(color: Theme.of(context).colorScheme.primary)),
                      ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _id,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(labelText: 'User ID', border: OutlineInputBorder()),
                      validator: (v) => (v == null || v.trim().length < 2) ? 'Enter your user ID' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _pw,
                      obscureText: !_show,
                      autofillHints: const [AutofillHints.password],
                      onFieldSubmitted: (_) => _submit(),
                      decoration: InputDecoration(
                        labelText: 'Password',
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          icon: Icon(_show ? Icons.visibility_off : Icons.visibility),
                          tooltip: 'Show or hide password',
                          onPressed: () => setState(() => _show = !_show),
                        ),
                      ),
                      validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
                    ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                      ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Sign in'),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      );
}

class HomeShell extends StatefulWidget {
  final Api api;
  const HomeShell({super.key, required this.api});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _i = 0;
  bool get staff => widget.api.role == 'security' || widget.api.role == 'custodian';

  List<(String, IconData, Widget)> get _tabs => [
        ('Report', Icons.add_circle_outline, ReportForm(api: widget.api)),
        ('Reports', Icons.list_alt, ReportsList(api: widget.api)),
        ('Matches', Icons.compare_arrows, MatchesScreen(api: widget.api, staff: staff)),
        ('Notifications', Icons.notifications_none, NotificationsScreen(api: widget.api, staff: staff)),
        if (staff) ('Manual queue', Icons.assignment_late_outlined, ManualQueueScreen(api: widget.api)),
      ];

  @override
  Widget build(BuildContext context) {
    final tabs = _tabs;
    if (_i >= tabs.length) _i = 0;
    final wide = MediaQuery.of(context).size.width >= 720;
    final body = KeyedSubtree(key: ValueKey('${tabs[_i].$1}-${widget.api.userId}'), child: tabs[_i].$3);
    return Scaffold(
      appBar: AppBar(
        title: Text('Lost & Found  •  ${widget.api.userId} (${widget.api.role})'),
        actions: [
          TextButton.icon(
            onPressed: () async {
              await widget.api.logout();
              if (context.mounted) {
                Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const SignInScreen(notice: 'You have been signed out.')));
              }
            },
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
          ),
        ],
      ),
      body: wide
          ? Row(children: [
              NavigationRail(
                selectedIndex: _i,
                onDestinationSelected: (v) => setState(() => _i = v),
                labelType: NavigationRailLabelType.all,
                destinations: [for (final t in tabs) NavigationRailDestination(icon: Icon(t.$2), label: Text(t.$1))],
              ),
              const VerticalDivider(width: 1),
              Expanded(child: body),
            ])
          : body,
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: _i,
              onDestinationSelected: (v) => setState(() => _i = v),
              destinations: [for (final t in tabs) NavigationDestination(icon: Icon(t.$2), label: t.$1)],
            ),
    );
  }
}

// ---------- Shared async view: loading / error / empty / data ----------
class AsyncList extends StatefulWidget {
  final Future<List<dynamic>> Function() load;
  final Widget Function(BuildContext, Map<String, dynamic>, VoidCallback reload) item;
  final String emptyText;
  const AsyncList({super.key, required this.load, required this.item, required this.emptyText});
  @override
  State<AsyncList> createState() => _AsyncListState();
}

class _AsyncListState extends State<AsyncList> {
  late Future<List<dynamic>> _f = widget.load();
  // Braces matter: an arrow body would return the Future to setState(), which throws in debug builds
  // and leaves the list un-refreshed (retry / refresh / post-action reload all silently failed).
  void reload() => setState(() {
        _f = widget.load();
      });

  @override
  Widget build(BuildContext context) => FutureBuilder<List<dynamic>>(
        future: _f,
        builder: (context, s) {
          if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (s.hasError) return ErrorView(error: s.error!, onRetry: reload);
          final items = s.data!;
          if (items.isEmpty) {
            return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.inbox_outlined, size: 48),
              const SizedBox(height: 8),
              Text(widget.emptyText),
              TextButton(onPressed: reload, child: const Text('Refresh')),
            ]));
          }
          return RefreshIndicator(
            onRefresh: () async => reload(),
            child: ListView(
              padding: const EdgeInsets.all(12),
              children: [for (final i in items) widget.item(context, Map<String, dynamic>.from(i as Map), reload)],
            ),
          );
        },
      );
}

class ErrorView extends StatelessWidget {
  final Object error;
  final VoidCallback onRetry;
  const ErrorView({super.key, required this.error, required this.onRetry});
  @override
  Widget build(BuildContext context) {
    final e = error is ApiError ? error as ApiError : null;
    final (icon, title) = e == null
        ? (Icons.error_outline, 'Something went wrong')
        : e.isNetwork
            ? (Icons.wifi_off, 'Network problem')
            : e.isAuth
                ? (Icons.lock_outline, e.status == 401 ? 'Please sign in again' : 'Not authorized')
                : e.isServer
                    ? (Icons.cloud_off, 'Server error')
                    : (Icons.error_outline, 'Request failed');
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 48, color: Theme.of(context).colorScheme.error),
          const SizedBox(height: 8),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(e?.message ?? '$error', textAlign: TextAlign.center),
          const SizedBox(height: 12),
          if (e != null && e.status == 401)
            FilledButton(
              onPressed: () => Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const SignInScreen(notice: 'Your session expired. Please sign in again.')),
                (_) => false,
              ),
              child: const Text('Sign in again'),
            )
          else if (e == null || !e.isAuth)
            FilledButton.tonal(onPressed: onRetry, child: const Text('Try again')),
        ]),
      ),
    );
  }
}

void toastOn(ScaffoldMessengerState messenger, String m, {Color? errorColor}) => messenger.showSnackBar(SnackBar(
      content: Text(m),
      duration: const Duration(seconds: 8), // long enough to read (UAT finding: the default 4 s was easy to miss)
      showCloseIcon: true,
      backgroundColor: errorColor,
    ));

void toast(BuildContext c, String m, {bool error = false}) =>
    toastOn(ScaffoldMessenger.of(c), m, errorColor: error ? Theme.of(c).colorScheme.error : null);

// ---------- Report form ----------
class ReportForm extends StatefulWidget {
  final Api api;
  const ReportForm({super.key, required this.api});
  @override
  State<ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends State<ReportForm> {
  final _form = GlobalKey<FormState>();
  String _type = 'lost';
  String _cat = 'wallet';
  final _desc = TextEditingController();
  final _loc = TextEditingController();
  DateTime _date = DateTime.now();
  String _sim = 'ok';
  bool _busy = false;
  Map<String, dynamic> _serverErrors = {};

  Future<void> _submit() async {
    setState(() => _serverErrors = {});
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final r = await widget.api.post('/api/reports', {
        'type': _type, 'category': _cat, 'description': _desc.text, 'location': _loc.text,
        'eventDate': _date.toIso8601String().substring(0, 10), if (demoTools) 'simulateDelivery': _sim,
      });
      final n = (r['matches'] as List).length;
      if (!mounted) return;
      toast(context, 'Report ${r['report']['id']} submitted. ${n == 0 ? 'No candidate match yet.' : '$n candidate match(es) found!'}');
      _desc.clear(); _loc.clear();
    } on ApiError catch (e) {
      if (!mounted) return;
      if (e.isValidation) setState(() => _serverErrors = e.details);
      toast(context, e.status == 409 ? 'Duplicate: ${e.message}' : e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Form(
              key: _form,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                SegmentedButton<String>(
                  segments: const [ButtonSegment(value: 'lost', label: Text('I lost something')), ButtonSegment(value: 'found', label: Text('I found something'))],
                  selected: {_type},
                  onSelectionChanged: (s) => setState(() => _type = s.first),
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: _cat,
                  decoration: InputDecoration(labelText: 'Category', border: const OutlineInputBorder(), errorText: _serverErrors['category']),
                  items: categories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
                  onChanged: (v) => setState(() => _cat = v!),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _desc, maxLines: 3, maxLength: 300,
                  decoration: InputDecoration(labelText: 'Description (colour, brand, marks)', border: const OutlineInputBorder(), errorText: _serverErrors['description']),
                  validator: (v) => (v == null || v.trim().length < 5) ? 'Describe the item (at least 5 characters)' : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _loc, maxLength: 100,
                  decoration: InputDecoration(labelText: 'Where?', border: const OutlineInputBorder(), errorText: _serverErrors['location']),
                  validator: (v) => (v == null || v.trim().length < 2) ? 'Enter a location' : null,
                ),
                const SizedBox(height: 4),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Date: ${_date.toIso8601String().substring(0, 10)}'),
                  subtitle: _serverErrors['eventDate'] != null ? Text(_serverErrors['eventDate'], style: TextStyle(color: Theme.of(context).colorScheme.error)) : null,
                  trailing: const Icon(Icons.calendar_today),
                  onTap: () async {
                    final d = await showDatePicker(context: context, initialDate: _date, firstDate: DateTime(2024), lastDate: DateTime.now());
                    if (d != null) setState(() => _date = d);
                  },
                ),
                if (demoTools)
                ExpansionTile(
                    title: const Text('Demo: simulate notification delivery'),
                    subtitle: const Text('Dev only - used for retry/recovery evidence'),
                    children: [
                      DropdownButtonFormField<String>(
                        initialValue: _sim,
                        items: const [
                          DropdownMenuItem(value: 'ok', child: Text('Normal')),
                          DropdownMenuItem(value: 'transient', child: Text('Transient failure (recovers on retry)')),
                          DropdownMenuItem(value: 'permanent', child: Text('Permanent failure (manual queue)')),
                        ],
                        onChanged: (v) => setState(() => _sim = v!),
                      ),
                    ],
                  ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _busy ? null : _submit,
                  icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send),
                  label: Text(_busy ? 'Submitting...' : 'Submit report'),
                ),
              ]),
            ),
          ),
        ),
      );
}

// ---------- Lists ----------
class ReportsList extends StatelessWidget {
  final Api api;
  const ReportsList({super.key, required this.api});
  @override
  Widget build(BuildContext context) => AsyncList(
        load: () => api.list('/api/reports'),
        emptyText: 'No reports yet.',
        item: (c, r, _) => Card(
          child: ListTile(
            leading: Icon(r['type'] == 'lost' ? Icons.search : Icons.back_hand_outlined),
            title: Text('${r['id']}  ${r['type']} - ${r['category']}'),
            subtitle: Text('${r['description']}\n${r['location']} - ${r['eventDate']}'),
            isThreeLine: true,
            trailing: Chip(label: Text('${r['status']}')),
          ),
        ),
      );
}

// Match review: item details side by side, confirmation dialogs that record the proof checked.
String _when(dynamic iso) {
  final d = DateTime.tryParse('$iso')?.toLocal();
  if (d == null) return '';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${two(d.month)}-${two(d.day)} ${two(d.hour)}:${two(d.minute)}';
}

class ItemBox extends StatelessWidget {
  final String heading;
  final Map<String, dynamic>? item;
  final String fallbackId;
  final bool showReporter;
  const ItemBox({super.key, required this.heading, required this.item, required this.fallbackId, this.showReporter = false});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final i = item;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(border: Border.all(color: Theme.of(context).colorScheme.outlineVariant), borderRadius: BorderRadius.circular(8)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(heading, style: t.labelLarge?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        if (i == null)
          Text('Details unavailable ($fallbackId)')
        else ...[
          Text('${i['category']}: ${i['description']}'),
          Text('Where: ${i['location']}   When: ${i['eventDate']}'),
          Text(showReporter ? 'Reported by ${i['reporterId']}  (${i['id']})' : 'Report ${i['id']}', style: t.bodySmall),
        ],
      ]),
    );
  }
}

/// Asks for the proof that was checked (or the reason for refusing). The note is required and goes into the audit trail.
class DecisionDialog extends StatefulWidget {
  final Map<String, dynamic> match;
  final bool confirm;
  const DecisionDialog({super.key, required this.match, required this.confirm});
  @override
  State<DecisionDialog> createState() => _DecisionDialogState();
}

class _DecisionDialogState extends State<DecisionDialog> {
  final _form = GlobalKey<FormState>();
  final _note = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final m = widget.match;
    return AlertDialog(
      title: Text(widget.confirm ? 'Confirm ownership' : 'Refuse this claim'),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Form(
            key: _form,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              ItemBox(heading: 'Lost item (claimant)', item: (m['lost'] as Map?)?.cast<String, dynamic>(), fallbackId: '${m['lostId']}', showReporter: true),
              const SizedBox(height: 8),
              ItemBox(heading: 'Found item', item: (m['found'] as Map?)?.cast<String, dynamic>(), fallbackId: '${m['foundId']}', showReporter: true),
              const SizedBox(height: 12),
              TextFormField(
                controller: _note,
                maxLines: 3,
                maxLength: 200,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: widget.confirm ? 'What proof did you check?' : 'Reason for refusing',
                  helperText: widget.confirm ? 'For example: student ID matched, described the sticker' : 'Recorded in the audit trail',
                  border: const OutlineInputBorder(),
                ),
                validator: (v) => (v == null || v.trim().length < 5) ? 'Write at least 5 characters' : null,
              ),
            ]),
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            if (_form.currentState!.validate()) Navigator.of(context).pop(_note.text.trim());
          },
          child: Text(widget.confirm ? 'Confirm' : 'Refuse claim'),
        ),
      ],
    );
  }
}

class MatchesScreen extends StatelessWidget {
  final Api api;
  final bool staff;
  const MatchesScreen({super.key, required this.api, required this.staff});

  // The layout can change while a dialog is open (tablet rotation, window resize), which rebuilds this screen and disposes the
  // widget that opened the dialog. The decision the user just made must still be sent and reported, so nothing here may depend
  // on that widget still being mounted: the messenger and colour are captured BEFORE the dialog opens.
  Future<void> _act(ScaffoldMessengerState messenger, Color errorColor, bool Function() stillShown, String path, Map<String, dynamic> body, VoidCallback reload, String ok) async {
    try {
      await api.post(path, body);
      toastOn(messenger, ok);
      if (stillShown()) reload();
    } on ApiError catch (e) {
      toastOn(messenger, e.message, errorColor: errorColor);
    }
  }

  Future<void> _decide(BuildContext c, Map<String, dynamic> m, bool confirm, VoidCallback reload) async {
    final messenger = ScaffoldMessenger.of(c);
    final errorColor = Theme.of(c).colorScheme.error;
    bool stillShown() => c.mounted;
    final note = await showDialog<String>(context: c, builder: (_) => DecisionDialog(match: m, confirm: confirm));
    if (note == null) return;
    await _act(messenger, errorColor, stillShown, '/api/matches/${m['id']}/verify', {'ownershipConfirmed': confirm, 'note': note}, reload, confirm ? 'Ownership verified' : 'Claim refused');
  }

  Future<void> _release(BuildContext c, Map<String, dynamic> m, VoidCallback reload) async {
    final claimant = (m['lost'] as Map?)?['reporterId'] ?? m['lostId'];
    final messenger = ScaffoldMessenger.of(c);
    final errorColor = Theme.of(c).colorScheme.error;
    bool stillShown() => c.mounted;
    final ok = await showDialog<bool>(
      context: c,
      builder: (d) => AlertDialog(
        title: const Text('Release item?'),
        content: Text('Hand the found item over to $claimant? This closes both reports and cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(d).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(d).pop(true), child: const Text('Release')),
        ],
      ),
    );
    if (ok != true) return;
    await _act(messenger, errorColor, stillShown, '/api/matches/${m['id']}/release', {}, reload, 'Item released');
  }

  String _statusText(String status) {
    if (staff) {
      return const {'candidate': 'Needs verification', 'verified': 'Ownership verified - ready to release', 'released': 'Released', 'rejected': 'Claim refused', 'withdrawn': 'Withdrawn (item went to another claimant)'}[status] ?? status;
    }
    return const {'candidate': 'A possible match was found. Staff will contact you to verify ownership.', 'verified': 'Ownership confirmed. Collect your item from the custodian.', 'released': 'Your item was released to you.', 'rejected': 'This match was not confirmed.', 'withdrawn': 'This item went to another claimant.'}[status] ?? status;
  }

  @override
  Widget build(BuildContext context) => AsyncList(
        load: () => api.list('/api/matches'),
        emptyText: 'No candidate matches yet. We will notify you when one appears.',
        item: (c, m, reload) {
          final lost = (m['lost'] as Map?)?.cast<String, dynamic>();
          final found = (m['found'] as Map?)?.cast<String, dynamic>();
          final status = '${m['status']}';
          return Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text('Match ${m['id']}  -  score ${m['score']}', style: Theme.of(c).textTheme.titleSmall)),
                  Chip(label: Text(status)),
                ]),
                Text(_statusText(status)),
                const SizedBox(height: 8),
                LayoutBuilder(builder: (c2, box) {
                  final lostBox = ItemBox(heading: staff ? 'Lost item (claimant)' : 'Your lost item', item: lost, fallbackId: '${m['lostId']}', showReporter: staff);
                  if (!staff) return lostBox;
                  final foundBox = ItemBox(heading: 'Found item', item: found, fallbackId: '${m['foundId']}', showReporter: true);
                  return box.maxWidth >= 560
                      ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: lostBox), const SizedBox(width: 8), Expanded(child: foundBox)])
                      : Column(children: [lostBox, const SizedBox(height: 8), foundBox]);
                }),
                if (staff && m['note'] != null && '${m['note']}'.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Note: ${m['note']}')),
                if (staff && status == 'candidate') ...[
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, children: [
                    FilledButton(onPressed: () => _decide(c, m, true, reload), child: const Text('Verify ownership')),
                    OutlinedButton(onPressed: () => _decide(c, m, false, reload), child: const Text('Reject')),
                  ]),
                ],
                if (staff && status == 'verified') ...[
                  const SizedBox(height: 8),
                  FilledButton(onPressed: () => _release(c, m, reload), child: const Text('Release item')),
                ],
              ]),
            ),
          );
        },
      );
}

class NotificationsScreen extends StatelessWidget {
  final Api api;
  final bool staff;
  const NotificationsScreen({super.key, required this.api, this.staff = false});

  static String _title(String kind) => const {'candidate_match': 'Possible match found for your lost item', 'aging_reminder': 'A found item has gone unclaimed'}[kind] ?? kind;

  static String _state(Map<String, dynamic> n, bool staff) {
    switch ('${n['status']}') {
      case 'delivered':
        return 'Delivered';
      case 'failed_permanent':
        return staff ? 'Delivery failed after ${n['attempts']} attempts${n['lastError'] != null ? ' (${n['lastError']})' : ''} - see Manual queue' : 'We could not reach you. Staff have been alerted.';
      default:
        return 'Sending...';
    }
  }

  @override
  Widget build(BuildContext context) => AsyncList(
        load: () => api.list('/api/notifications'),
        emptyText: 'No notifications.',
        item: (c, n, _) {
          final ok = n['status'] == 'delivered';
          final when = _when(n['createdAt']);
          return Card(
            child: ListTile(
              leading: Icon(ok ? Icons.check_circle_outline : Icons.warning_amber, color: ok ? Colors.green : Colors.orange),
              title: Text(_title('${n['kind']}')),
              subtitle: Text('${when.isEmpty ? '' : '$when  -  '}${_state(n, staff)}${staff ? '\nRef ${n['id']}${n['matchId'] != null ? ' / match ${n['matchId']}' : ''}' : ''}'),
              isThreeLine: staff,
            ),
          );
        },
      );
}

class ManualQueueScreen extends StatelessWidget {
  final Api api;
  const ManualQueueScreen({super.key, required this.api});
  @override
  Widget build(BuildContext context) => AsyncList(
        load: () => api.list('/api/manual-queue'),
        emptyText: 'Nothing needs manual handling.',
        item: (c, q, reload) => Card(
          child: ListTile(
            leading: const Icon(Icons.assignment_late_outlined),
            title: Text('${q['id']}  ${q['kind']}'),
            subtitle: Text('Ref: ${q['refId']}  -  ${q['reason']}  -  ${q['status']}'),
            trailing: q['status'] != 'open'
                ? null
                : q['kind'] == 'notification_failure'
                    ? FilledButton(
                        onPressed: () async {
                          try {
                            await api.post('/api/manual-queue/${q['id']}/retry-notification');
                            if (c.mounted) toast(c, 'Notification re-sent');
                            reload();
                          } on ApiError catch (e) {
                            if (c.mounted) toast(c, e.message, error: true);
                          }
                        },
                        child: const Text('Re-send'))
                    : FilledButton(
                        onPressed: () async {
                          try {
                            await api.post('/api/manual-queue/${q['id']}/resolve', {'resolution': 'Disposed per policy', 'dispose': true});
                            if (c.mounted) toast(c, 'Marked disposed');
                            reload();
                          } on ApiError catch (e) {
                            if (c.mounted) toast(c, e.message, error: true);
                          }
                        },
                        child: const Text('Dispose')),
          ),
        ),
      );
}
