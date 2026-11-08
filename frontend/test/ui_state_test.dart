// Week 15 (IA6): Flutter UI state tests against a mocked API. IDs U07.. are referenced from docs/traceability.json.
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lostfound_app/api.dart';
import 'package:lostfound_app/main.dart';

http.Response js(int code, Object body) => http.Response(jsonEncode(body), code, headers: {'content-type': 'application/json'});
Map<String, dynamic> err(String code, String msg, [Map<String, dynamic>? details]) => {'error': {'code': code, 'message': msg, 'details': details}};

final report = {'id': 'R-0001', 'type': 'lost', 'category': 'wallet', 'description': 'black leather wallet', 'location': 'library', 'eventDate': '2026-11-01', 'status': 'open'};
Map<String, dynamic> match(String status) => {'id': 'M-0002', 'lostId': 'R-0001', 'foundId': 'R-0003', 'score': 88, 'status': status};

// Sets the window the app sees (MediaQuery), not just the render surface.
Future<void> useSize(WidgetTester t, double w, double h) async {
  t.view.physicalSize = Size(w, h);
  t.view.devicePixelRatio = 1.0;
  addTearDown(() {
    t.view.resetPhysicalSize();
    t.view.resetDevicePixelRatio();
  });
}

Future<void> pumpScreen(WidgetTester t, Widget w) async {
  await useSize(t, 900, 1400);
  await t.pumpWidget(MaterialApp(home: Scaffold(body: w)));
}

void main() {
  tearDown(() => Api.client = http.Client());

  testWidgets('U07 sign-in failure shows the server message and stays on the sign-in screen', (t) async {
    Api.client = MockClient((r) async => js(401, err('INVALID_CREDENTIALS', 'Invalid user ID or password')));
    await t.pumpWidget(const LostFoundApp());
    await t.enterText(find.byType(TextFormField).at(0), 'stu1');
    await t.enterText(find.byType(TextFormField).at(1), 'wrong');
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await t.pumpAndSettle();
    expect(find.text('Invalid user ID or password'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
  });

  testWidgets('U08 account lockout (429) shows a wait message, not a raw error', (t) async {
    Api.client = MockClient((r) async => js(429, err('ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.')));
    await t.pumpWidget(const LostFoundApp());
    await t.enterText(find.byType(TextFormField).at(0), 'stu1');
    await t.enterText(find.byType(TextFormField).at(1), 'x');
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await t.pumpAndSettle();
    expect(find.textContaining('Too many attempts'), findsOneWidget);
  });

  testWidgets('U09 successful sign-in opens the home shell; student has no Manual queue destination', (t) async {
    await useSize(t, 900, 1000);
    Api.client = MockClient((r) async => js(200, {'token': 'a.b.c', 'user': {'id': 'stu1', 'role': 'student'}, 'expiresIn': 900}));
    await t.pumpWidget(const LostFoundApp());
    await t.enterText(find.byType(TextFormField).at(0), 'stu1');
    await t.enterText(find.byType(TextFormField).at(1), 'pw');
    await t.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await t.pumpAndSettle();
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Manual queue'), findsNothing);
    expect(find.textContaining('stu1 (student)'), findsOneWidget);
  });

  testWidgets('U10 reports list shows a loading indicator first, then the data', (t) async {
    Api.client = MockClient((r) async => js(200, [report]));
    await pumpScreen(t, ReportsList(api: Api.testing('stu1', 'student')));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await t.pumpAndSettle();
    expect(find.textContaining('R-0001'), findsOneWidget);
    expect(find.text('open'), findsOneWidget);
  });

  testWidgets('U11 server error (500) shows "Server error" and Try again recovers', (t) async {
    var calls = 0;
    Api.client = MockClient((r) async => ++calls == 1 ? js(500, err('INTERNAL', 'Internal server error')) : js(200, [report]));
    await pumpScreen(t, ReportsList(api: Api.testing('stu1', 'student')));
    await t.pumpAndSettle();
    expect(find.text('Server error'), findsOneWidget);
    await t.tap(find.text('Try again'));
    await t.pumpAndSettle();
    expect(find.textContaining('R-0001'), findsOneWidget);
    expect(calls, 2);
  });

  testWidgets('U12 [D15] a non-JSON gateway error page (502 HTML) is shown as a server error, not a crash', (t) async {
    Api.client = MockClient((r) async => http.Response('<html><body>502 Bad Gateway</body></html>', 502, headers: {'content-type': 'text/html'}));
    await pumpScreen(t, ReportsList(api: Api.testing('stu1', 'student')));
    await t.pumpAndSettle();
    expect(find.text('Server error'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('U13 network failure while loading shows Network problem with retry', (t) async {
    Api.client = MockClient((r) async => throw http.ClientException('connection refused'));
    await pumpScreen(t, ReportsList(api: Api.testing('stu1', 'student')));
    await t.pumpAndSettle();
    expect(find.text('Network problem'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('U14 students never see Verify/Reject/Release controls', (t) async {
    Api.client = MockClient((r) async => js(200, [match('candidate'), {...match('verified'), 'id': 'M-0009'}]));
    await pumpScreen(t, MatchesScreen(api: Api.testing('stu1', 'student'), staff: false));
    await t.pumpAndSettle();
    expect(find.textContaining('M-0002'), findsOneWidget);
    expect(find.text('Verify ownership'), findsNothing);
    expect(find.text('Reject'), findsNothing);
    expect(find.text('Release item'), findsNothing);
  });

  testWidgets('U15 staff see Verify/Reject on a candidate and Release on a verified match', (t) async {
    Api.client = MockClient((r) async => js(200, [match('candidate'), {...match('verified'), 'id': 'M-0009'}, {...match('released'), 'id': 'M-0010'}]));
    await pumpScreen(t, MatchesScreen(api: Api.testing('cust1', 'custodian'), staff: true));
    await t.pumpAndSettle();
    expect(find.text('Verify ownership'), findsOneWidget);
    expect(find.text('Reject'), findsOneWidget);
    expect(find.text('Release item'), findsOneWidget);
  });

  testWidgets('U16 verifying a match (with the required note) posts to the right endpoint and refreshes the list', (t) async {
    final calls = <String>[];
    var status = 'candidate';
    Api.client = MockClient((r) async {
      calls.add('${r.method} ${r.url.path}');
      if (r.method == 'POST') { status = 'verified'; return js(200, match('verified')); }
      return js(200, [match(status)]);
    });
    await pumpScreen(t, MatchesScreen(api: Api.testing('cust1', 'custodian'), staff: true));
    await t.pumpAndSettle();
    await t.tap(find.text('Verify ownership'));
    await t.pumpAndSettle();
    await t.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextFormField)), 'Student ID matched');
    await t.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text('Confirm')));
    await t.pumpAndSettle();
    expect(calls, contains('POST /api/matches/M-0002/verify'));
    expect(find.text('Release item'), findsOneWidget, reason: 'list reloads and now offers Release');
  });

  testWidgets('U17 conflict of interest (403) on Verify is shown to the user and the list is unchanged', (t) async {
    Api.client = MockClient((r) async => r.method == 'POST' ? js(403, err('CONFLICT_OF_INTEREST', 'You cannot decide a match for an item you reported')) : js(200, [match('candidate')]));
    await pumpScreen(t, MatchesScreen(api: Api.testing('sec1', 'security'), staff: true));
    await t.pumpAndSettle();
    await t.tap(find.text('Verify ownership'));
    await t.pumpAndSettle();
    await t.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextFormField)), 'Student ID matched');
    await t.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text('Confirm')));
    await t.pumpAndSettle();
    expect(find.textContaining('cannot decide a match'), findsOneWidget);
    expect(find.text('Verify ownership'), findsOneWidget);
  });

  testWidgets('U18 manual queue returns 403 for a student: "Not authorized" and no retry button', (t) async {
    Api.client = MockClient((r) async => js(403, err('FORBIDDEN', 'Role not permitted')));
    await pumpScreen(t, ManualQueueScreen(api: Api.testing('stu1', 'student')));
    await t.pumpAndSettle();
    expect(find.text('Not authorized'), findsOneWidget);
    expect(find.text('Try again'), findsNothing);
  });

  testWidgets('U19 manual queue lists a failed notification with a Re-send action', (t) async {
    final calls = <String>[];
    Api.client = MockClient((r) async {
      calls.add('${r.method} ${r.url.path}');
      if (r.method == 'POST') return js(200, {'notification': {'status': 'delivered'}, 'queueItem': {'status': 'resolved'}});
      return js(200, [{'id': 'MQ-0004', 'kind': 'notification_failure', 'refId': 'N-0003', 'reason': 'Recipient mailbox unavailable', 'status': 'open'}]);
    });
    await pumpScreen(t, ManualQueueScreen(api: Api.testing('cust1', 'custodian')));
    await t.pumpAndSettle();
    expect(find.textContaining('Recipient mailbox unavailable'), findsOneWidget);
    await t.tap(find.text('Re-send'));
    await t.pumpAndSettle();
    expect(calls, contains('POST /api/manual-queue/MQ-0004/retry-notification'));
  });

  testWidgets('U20 report form shows server-side field errors under the fields (422)', (t) async {
    Api.client = MockClient((r) async => js(422, err('VALIDATION_FAILED', 'Invalid report', {'eventDate': 'eventDate cannot be in the future', 'location': 'location must be 2-100 text characters'})));
    await pumpScreen(t, ReportForm(api: Api.testing('stu1', 'student')));
    await t.enterText(find.byType(TextFormField).at(0), 'black leather wallet');
    await t.enterText(find.byType(TextFormField).at(1), 'library');
    await t.tap(find.text('Submit report'));
    await t.pumpAndSettle();
    expect(find.text('eventDate cannot be in the future'), findsOneWidget);
    expect(find.text('location must be 2-100 text characters'), findsOneWidget);
    expect(find.text('Submit report'), findsOneWidget, reason: 'button re-enabled after failure');
  });

  testWidgets('U21 duplicate report (409) is explained to the user', (t) async {
    Api.client = MockClient((r) async => js(409, err('DUPLICATE_REPORT', 'A similar open report already exists (R-0001)')));
    await pumpScreen(t, ReportForm(api: Api.testing('stu1', 'student')));
    await t.enterText(find.byType(TextFormField).at(0), 'black leather wallet');
    await t.enterText(find.byType(TextFormField).at(1), 'library');
    await t.tap(find.text('Submit report'));
    await t.pumpAndSettle();
    expect(find.textContaining('similar open report already exists'), findsOneWidget);
  });

  testWidgets('U22 successful submit shows the match count and clears the form', (t) async {
    Api.client = MockClient((r) async => js(201, {'report': {'id': 'R-0007'}, 'matches': [match('candidate')]}));
    await pumpScreen(t, ReportForm(api: Api.testing('stu1', 'student')));
    await t.enterText(find.byType(TextFormField).at(0), 'black leather wallet');
    await t.enterText(find.byType(TextFormField).at(1), 'library');
    await t.tap(find.text('Submit report'));
    await t.pumpAndSettle();
    expect(find.textContaining('R-0007 submitted'), findsOneWidget);
    expect(find.textContaining('1 candidate match'), findsOneWidget);
    expect(find.text('black leather wallet'), findsNothing);
  });

  testWidgets('U23 submit button is disabled with a progress indicator while the request is in flight', (t) async {
    final gate = Future<void>.delayed(const Duration(milliseconds: 300));
    Api.client = MockClient((r) async { await gate; return js(201, {'report': {'id': 'R-0008'}, 'matches': []}); });
    await pumpScreen(t, ReportForm(api: Api.testing('stu1', 'student')));
    await t.enterText(find.byType(TextFormField).at(0), 'black leather wallet');
    await t.enterText(find.byType(TextFormField).at(1), 'library');
    await t.tap(find.text('Submit report'));
    await t.pump(const Duration(milliseconds: 50));
    expect(find.text('Submitting...'), findsOneWidget);
    expect(t.widget<FilledButton>(find.byType(FilledButton)).onPressed, isNull);
    await t.pumpAndSettle();
    expect(find.text('Submit report'), findsOneWidget);
  });

  testWidgets('U24 network failure on submit shows an error message and re-enables the button', (t) async {
    Api.client = MockClient((r) async => throw http.ClientException('offline'));
    await pumpScreen(t, ReportForm(api: Api.testing('stu1', 'student')));
    await t.enterText(find.byType(TextFormField).at(0), 'black leather wallet');
    await t.enterText(find.byType(TextFormField).at(1), 'library');
    await t.tap(find.text('Submit report'));
    await t.pumpAndSettle();
    expect(find.textContaining('Cannot reach the server'), findsOneWidget);
    expect(find.text('Submit report'), findsOneWidget);
  });

  testWidgets('U25 responsive layout (wide, 1000 px): navigation rail; staff get the Manual queue tab', (t) async {
    Api.client = MockClient((r) async => js(200, []));
    await useSize(t, 1000, 800);
    await t.pumpWidget(MaterialApp(home: HomeShell(api: Api.testing('cust1', 'custodian'))));
    await t.pumpAndSettle();
    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('Manual queue'), findsOneWidget);
  });

  testWidgets('U26 responsive layout (phone, 400 px): bottom bar, no overflow on the report form', (t) async {
    Api.client = MockClient((r) async => js(200, []));
    await useSize(t, 400, 800);
    await t.pumpWidget(MaterialApp(home: HomeShell(api: Api.testing('stu1', 'student'))));
    await t.pumpAndSettle();
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);
    expect(find.text('Manual queue'), findsNothing);
    expect(t.takeException(), isNull, reason: 'no RenderFlex overflow at phone width');
  });

  // ---------------- Week 17: fixes agreed after user acceptance testing ----------------
  Map<String, dynamic> richMatch(String status) => {
        ...match(status),
        'lost': {'id': 'R-0001', 'category': 'wallet', 'description': 'black leather wallet with student card', 'location': 'library second floor', 'eventDate': '2026-11-08', 'reporterId': 'stu1'},
        'found': {'id': 'R-0003', 'category': 'wallet', 'description': 'black wallet, student card inside, red sticker', 'location': 'library 2nd floor desk', 'eventDate': '2026-11-08', 'reporterId': 'sec1'},
      };
  Finder inDialog(Finder f) => find.descendant(of: find.byType(AlertDialog), matching: f);

  testWidgets('U27 [F1] staff see both items (description, location, reporter) on the match card', (t) async {
    Api.client = MockClient((r) async => js(200, [richMatch('candidate')]));
    await pumpScreen(t, MatchesScreen(api: Api.testing('cust1', 'custodian'), staff: true));
    await t.pumpAndSettle();
    expect(find.textContaining('black leather wallet with student card'), findsOneWidget);
    expect(find.textContaining('red sticker'), findsOneWidget);
    expect(find.textContaining('Reported by stu1'), findsOneWidget);
    expect(find.textContaining('Reported by sec1'), findsOneWidget);
    expect(find.text('Needs verification'), findsOneWidget);
  });

  testWidgets('U28 [F2] Verify opens a dialog showing both items; an empty note is refused and nothing is posted; Cancel posts nothing', (t) async {
    final posts = <String>[];
    Api.client = MockClient((r) async { if (r.method == 'POST') posts.add(r.url.path); return js(200, [richMatch('candidate')]); });
    await pumpScreen(t, MatchesScreen(api: Api.testing('cust1', 'custodian'), staff: true));
    await t.pumpAndSettle();
    await t.tap(find.text('Verify ownership'));
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(inDialog(find.textContaining('red sticker')), findsOneWidget, reason: 'items are visible while deciding');
    await t.tap(inDialog(find.text('Confirm')));
    await t.pumpAndSettle();
    expect(find.text('Write at least 5 characters'), findsOneWidget);
    expect(posts, isEmpty);
    await t.tap(inDialog(find.text('Cancel')));
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(posts, isEmpty);
  });

  testWidgets('U29 [F2] Verify with a note posts ownershipConfirmed:true and the note, then refreshes', (t) async {
    final bodies = <Map<String, dynamic>>[];
    var status = 'candidate';
    Api.client = MockClient((r) async {
      if (r.method == 'POST') { bodies.add(jsonDecode(r.body) as Map<String, dynamic>); status = 'verified'; return js(200, richMatch('verified')); }
      return js(200, [richMatch(status)]);
    });
    await pumpScreen(t, MatchesScreen(api: Api.testing('cust1', 'custodian'), staff: true));
    await t.pumpAndSettle();
    await t.tap(find.text('Verify ownership'));
    await t.pumpAndSettle();
    await t.enterText(inDialog(find.byType(TextFormField)), '  Student ID matched, described the red sticker  ');
    await t.tap(inDialog(find.text('Confirm')));
    await t.pumpAndSettle();
    expect(bodies, hasLength(1));
    expect(bodies.single['ownershipConfirmed'], true);
    expect(bodies.single['note'], 'Student ID matched, described the red sticker', reason: 'trimmed note is sent');
    expect(find.text('Release item'), findsOneWidget);
  });

  testWidgets('U30 [F2] Reject needs a reason and posts ownershipConfirmed:false', (t) async {
    final bodies = <Map<String, dynamic>>[];
    Api.client = MockClient((r) async { if (r.method == 'POST') { bodies.add(jsonDecode(r.body) as Map<String, dynamic>); return js(200, richMatch('rejected')); } return js(200, [richMatch('candidate')]); });
    await pumpScreen(t, MatchesScreen(api: Api.testing('cust1', 'custodian'), staff: true));
    await t.pumpAndSettle();
    await t.tap(find.text('Reject'));
    await t.pumpAndSettle();
    expect(find.text('Refuse this claim'), findsOneWidget);
    await t.tap(inDialog(find.text('Refuse claim')));
    await t.pumpAndSettle();
    expect(bodies, isEmpty);
    await t.enterText(inDialog(find.byType(TextFormField)), 'Could not describe the tag colour');
    await t.tap(inDialog(find.text('Refuse claim')));
    await t.pumpAndSettle();
    expect(bodies.single, {'ownershipConfirmed': false, 'note': 'Could not describe the tag colour'});
  });

  testWidgets('U31 [F2] Release asks for confirmation naming the claimant; Cancel posts nothing; Release posts', (t) async {
    final posts = <String>[];
    Api.client = MockClient((r) async { if (r.method == 'POST') { posts.add(r.url.path); return js(200, richMatch('released')); } return js(200, [richMatch('verified')]); });
    await pumpScreen(t, MatchesScreen(api: Api.testing('cust1', 'custodian'), staff: true));
    await t.pumpAndSettle();
    await t.tap(find.text('Release item'));
    await t.pumpAndSettle();
    expect(find.text('Release item?'), findsOneWidget);
    expect(find.textContaining('over to stu1'), findsOneWidget);
    await t.tap(find.text('Cancel'));
    await t.pumpAndSettle();
    expect(posts, isEmpty);
    await t.tap(find.text('Release item'));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(FilledButton, 'Release'));
    await t.pumpAndSettle();
    expect(posts, ['/api/matches/M-0002/release']);
  });

  testWidgets('U32 [F1][F4] a student sees plain-language status and only their own item, no staff controls and no found item', (t) async {
    Api.client = MockClient((r) async => js(200, [{'id': 'M-0002', 'lostId': 'R-0001', 'score': 82, 'status': 'candidate', 'lost': richMatch('candidate')['lost']}]));
    await pumpScreen(t, MatchesScreen(api: Api.testing('stu1', 'student'), staff: false));
    await t.pumpAndSettle();
    expect(find.textContaining('A possible match was found. Staff will contact you'), findsOneWidget);
    expect(find.text('Your lost item'), findsOneWidget);
    expect(find.textContaining('black leather wallet with student card'), findsOneWidget);
    expect(find.text('Found item'), findsNothing);
    expect(find.textContaining('red sticker'), findsNothing);
    expect(find.text('Verify ownership'), findsNothing);
  });

  testWidgets('U33 [F4] notifications read as plain language with a time; staff additionally see references and delivery detail', (t) async {
    final data = [
      {'id': 'N-0004', 'matchId': 'M-0003', 'kind': 'candidate_match', 'status': 'delivered', 'attempts': 1, 'lastError': null, 'createdAt': '2026-11-07T17:18:18.753Z'},
      {'id': 'N-0009', 'matchId': 'M-0008', 'kind': 'candidate_match', 'status': 'failed_permanent', 'attempts': 3, 'lastError': 'Recipient mailbox unavailable', 'createdAt': '2026-11-07T17:20:00.000Z'},
    ];
    Api.client = MockClient((r) async => js(200, data));
    await pumpScreen(t, NotificationsScreen(api: Api.testing('stu1', 'student')));
    await t.pumpAndSettle();
    expect(find.text('Possible match found for your lost item'), findsNWidgets(2));
    expect(find.textContaining('Delivered'), findsOneWidget);
    expect(find.textContaining('Staff have been alerted'), findsOneWidget);
    expect(find.textContaining('N-0004'), findsNothing, reason: 'no internal ids for students');
    expect(find.textContaining('candidate_match'), findsNothing);
    await pumpScreen(t, NotificationsScreen(api: Api.testing('cust1', 'custodian'), staff: true));
    await t.pumpAndSettle();
    expect(find.textContaining('Ref N-0009 / match M-0008'), findsOneWidget);
    expect(find.textContaining('Delivery failed after 3 attempts (Recipient mailbox unavailable)'), findsOneWidget);
  });

  testWidgets('U34 [F5] the delivery simulator is hidden in normal builds and never sent to the server', (t) async {
    final bodies = <Map<String, dynamic>>[];
    Api.client = MockClient((r) async { bodies.add(jsonDecode(r.body) as Map<String, dynamic>); return js(201, {'report': {'id': 'R-0009'}, 'matches': []}); });
    await pumpScreen(t, ReportForm(api: Api.testing('stu1', 'student')));
    expect(find.textContaining('Demo: simulate'), findsNothing);
    await t.enterText(find.byType(TextFormField).at(0), 'black leather wallet');
    await t.enterText(find.byType(TextFormField).at(1), 'library');
    await t.tap(find.text('Submit report'));
    await t.pumpAndSettle();
    expect(bodies.single.containsKey('simulateDelivery'), false);
  });

  testWidgets('U35 [F7] confirmation messages stay visible long enough to read and can be dismissed', (t) async {
    Api.client = MockClient((r) async => js(201, {'report': {'id': 'R-0007'}, 'matches': []}));
    await pumpScreen(t, ReportForm(api: Api.testing('stu1', 'student')));
    await t.enterText(find.byType(TextFormField).at(0), 'black leather wallet');
    await t.enterText(find.byType(TextFormField).at(1), 'library');
    await t.tap(find.text('Submit report'));
    await t.pumpAndSettle(const Duration(milliseconds: 100));
    final bar = t.widget<SnackBar>(find.byType(SnackBar));
    expect(bar.duration.inSeconds >= 6, true);
    expect(bar.showCloseIcon, true);
  });

  testWidgets('U36 [F8] a decision is still sent and reported when the layout changes (rotation / window resize) while the dialog is open', (t) async {
    final posts = <String>[];
    Api.client = MockClient((r) async {
      if (r.method == 'POST') { posts.add(r.url.path); return js(200, richMatch('verified')); }
      return js(200, r.url.path == '/api/matches' ? [richMatch('candidate')] : []);
    });
    await useSize(t, 1000, 800);
    await t.pumpWidget(MaterialApp(home: HomeShell(api: Api.testing('cust1', 'custodian'))));
    await t.pumpAndSettle();
    await t.tap(find.text('Matches'));
    await t.pumpAndSettle();
    await t.tap(find.text('Verify ownership'));
    await t.pumpAndSettle();
    await t.enterText(inDialog(find.byType(TextFormField)), 'Student ID matched');
    await useSize(t, 400, 800); // wide rail layout -> bottom-bar layout: the screen under the dialog is rebuilt and the old widget disposed
    await t.pumpAndSettle();
    await t.tap(inDialog(find.text('Confirm')));
    await t.pumpAndSettle();
    expect(posts, ['/api/matches/M-0002/verify'], reason: 'the decision must not be silently dropped');
    expect(find.text('Ownership verified'), findsOneWidget, reason: 'and the user is told');
  });
}
