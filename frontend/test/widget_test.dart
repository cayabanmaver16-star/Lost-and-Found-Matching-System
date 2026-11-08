import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lostfound_app/api.dart';
import 'package:lostfound_app/main.dart';

void main() {
  testWidgets('W01 sign-in validates empty user id and password', (t) async {
    await t.pumpWidget(const LostFoundApp());
    await t.tap(find.text('Sign in').last);
    await t.pump();
    expect(find.text('Enter your user ID'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
  });

  testWidgets('W02 password field is obscured by default', (t) async {
    await t.pumpWidget(const LostFoundApp());
    final tf = t.widget<EditableText>(find.byType(EditableText).last);
    expect(tf.obscureText, isTrue);
  });

  testWidgets('W03 report form shows validation errors before calling API', (t) async {
    await t.pumpWidget(MaterialApp(home: Scaffold(body: ReportForm(api: Api.testing('stu1', 'student')))));
    await t.tap(find.text('Submit report'));
    await t.pump();
    expect(find.text('Describe the item (at least 5 characters)'), findsOneWidget);
    expect(find.text('Enter a location'), findsOneWidget);
  });

  testWidgets('W04 network failure shows error state with retry', (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(body: ErrorView(error: ApiError(0, 'NETWORK', 'Cannot reach the server.'), onRetry: () {}))));
    expect(find.text('Network problem'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('W05 expired session (401) offers sign in again, no retry', (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(body: ErrorView(error: ApiError(401, 'UNAUTHENTICATED', 'Authentication required'), onRetry: () {}))));
    expect(find.text('Sign in again'), findsOneWidget);
    expect(find.text('Try again'), findsNothing);
  });

  testWidgets('W06 authorization error hides retry', (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(body: ErrorView(error: ApiError(403, 'FORBIDDEN', 'Role not permitted'), onRetry: () {}))));
    expect(find.text('Not authorized'), findsOneWidget);
    expect(find.text('Try again'), findsNothing);
  });

  testWidgets('W07 empty list shows empty state', (t) async {
    await t.pumpWidget(MaterialApp(
        home: Scaffold(body: AsyncList(load: () async => [], item: (c, m, r) => const SizedBox(), emptyText: 'No reports yet.'))));
    await t.pumpAndSettle();
    expect(find.text('No reports yet.'), findsOneWidget);
  });
}
