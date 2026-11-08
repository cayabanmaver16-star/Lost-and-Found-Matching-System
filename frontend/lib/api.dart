import 'dart:convert';
import 'package:http/http.dart' as http;

/// Typed error so screens can show distinct states (validation, auth, network, server).
class ApiError implements Exception {
  final int status; // 0 = network
  final String code;
  final String message;
  final Map<String, dynamic> details;
  ApiError(this.status, this.code, this.message, [this.details = const {}]);
  bool get isNetwork => status == 0;
  bool get isAuth => status == 401 || status == 403;
  bool get isValidation => status == 422;
  bool get isServer => status >= 500;
  @override
  String toString() => message;
}

class Api {
  static String base = const String.fromEnvironment('API_BASE', defaultValue: 'https://localhost:3000');
  /// Injectable HTTP client so UI state tests can run against canned server responses.
  static http.Client client = http.Client();
  final String userId;
  final String role;
  // Token is kept in memory only (not localStorage/cookies): a reload signs the user out and
  // a script cannot read it from persistent browser storage.
  final String _token;
  Api._(this.userId, this.role, this._token);

  /// For widget tests only.
  Api.testing(this.userId, this.role) : _token = 'test';

  Map<String, String> get _h => {'content-type': 'application/json', 'authorization': 'Bearer $_token'};

  static Future<Api> login(String userId, String password) async {
    http.Response r;
    try {
      r = await client
          .post(Uri.parse('$base/api/auth/login'),
              headers: {'content-type': 'application/json'}, body: jsonEncode({'userId': userId, 'password': password}))
          .timeout(const Duration(seconds: 15));
    } catch (_) {
      throw ApiError(0, 'NETWORK', 'Cannot reach the server over HTTPS. Is the API running and its certificate trusted?');
    }
    final data = _decode(r);
    if (r.statusCode == 200 && data is Map && data['user'] is Map && data['token'] is String) {
      return Api._(data['user']['id'], data['user']['role'], data['token']);
    }
    throw _errorFrom(r, data, 'Sign-in failed');
  }

  /// A reverse proxy / gateway can answer with an HTML or plain-text error page. Never let a FormatException
  /// escape: treat any unparseable body as "no JSON" and fall back to a status-based message.
  static dynamic _decode(http.Response r) {
    if (r.body.isEmpty) return null;
    try {
      return jsonDecode(r.body);
    } catch (_) {
      return null;
    }
  }

  static ApiError _errorFrom(http.Response r, dynamic data, String fallback) {
    final e = (data is Map ? data['error'] : null);
    if (e is Map) {
      return ApiError(r.statusCode, '${e['code'] ?? 'ERROR'}', '${e['message'] ?? fallback}',
          Map<String, dynamic>.from((e['details'] as Map?) ?? {}));
    }
    final msg = r.statusCode >= 500 ? 'The server had a problem (HTTP ${r.statusCode}). Please try again shortly.' : fallback;
    return ApiError(r.statusCode, 'ERROR', msg);
  }

  /// Best-effort server-side revocation of the token.
  Future<void> logout() async {
    try {
      await _send('POST', '/api/auth/logout', {});
    } catch (_) {}
  }

  Future<dynamic> _send(String method, String path, [Object? body]) async {
    http.Response r;
    try {
      final uri = Uri.parse('$base$path');
      final req = http.Request(method, uri)..headers.addAll(_h);
      if (body != null) req.body = jsonEncode(body);
      r = await http.Response.fromStream(await client.send(req).timeout(const Duration(seconds: 15)));
    } catch (_) {
      throw ApiError(0, 'NETWORK', 'Cannot reach the server. Check that the API is running and try again.');
    }
    final data = _decode(r);
    if (r.statusCode >= 200 && r.statusCode < 300) return data;
    throw _errorFrom(r, data, 'Request failed');
  }

  Future<List<dynamic>> list(String path) async => (await _send('GET', path)) as List<dynamic>;
  Future<Map<String, dynamic>> post(String path, [Object? body]) async =>
      Map<String, dynamic>.from(await _send('POST', path, body ?? {}));
}
