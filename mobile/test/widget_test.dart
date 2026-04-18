import 'package:flutter_test/flutter_test.dart';
import 'package:craftedday/main.dart';

void main() {
  testWidgets('App boots', (WidgetTester tester) async {
    await tester.pumpWidget(const CraftedDayApp());
  });
}
