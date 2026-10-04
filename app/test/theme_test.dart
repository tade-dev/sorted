import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sorted/core/theme/sorted_colors.dart';
import 'package:sorted/core/theme/sorted_shape.dart';
import 'package:sorted/core/theme/sorted_theme.dart';

void main() {
  testWidgets('SortedColors is reachable from any BuildContext', (tester) async {
    SortedColors? captured;

    await tester.pumpWidget(
      MaterialApp(
        theme: sortedTheme(),
        home: Builder(
          builder: (context) {
            captured = SortedColors.of(context);
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    expect(captured, isNotNull);
  });

  testWidgets('tokens match DESIGN.md exactly', (tester) async {
    late SortedColors c;
    await tester.pumpWidget(
      MaterialApp(
        theme: sortedTheme(),
        home: Builder(
          builder: (context) {
            c = SortedColors.of(context);
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    expect(c.ink, const Color(0xFF001C64));
    expect(c.primary, const Color(0xFF0070E0));
    expect(c.success, const Color(0xFF147A47));
    expect(c.successTint, const Color(0xFFE3F4EA));
    expect(c.warningTint, const Color(0xFFFFF4D6));
    expect(c.warningText, const Color(0xFF7A5200));
    expect(c.neutralTint, const Color(0xFFEBEEF3));
    expect(c.darkLink, const Color(0xFF123C96));
    expect(c.accentCyan, const Color(0xFF60CDFF));
    expect(c.paidBar, const Color(0xFF5BD08F));
  });

  testWidgets('the scaffold background is the background token', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: sortedTheme(), home: const Scaffold()));
    final theme = Theme.of(tester.element(find.byType(Scaffold)));
    expect(theme.scaffoldBackgroundColor, const Color(0xFFF5F7FA));
  });

  test('status colours are distinguishable by lightness, not hue alone', () {
    // DESIGN.md requires this so the Paid/Waiting/Draft chips stay readable
    // for colour-blind users and in a greyscale screenshot.
    //
    // The separation lives in the FOREGROUND, not the tint. All three tints are
    // pale fills within 0.018 lightness of each other (successTint 0.9235,
    // warningTint 0.9196, neutralTint 0.9373), so a tint-only assertion would
    // fail against the design's own palette. What a reader actually tells apart
    // is the label colour on top, and those are 0.039-0.129 apart.
    const c = SortedColors.light;
    final labels = <String, Color>{
      'Paid': c.success,
      'Waiting': c.warningText,
      'Draft': c.muted,
    };

    final names = labels.keys.toList();
    for (var i = 0; i < names.length; i++) {
      for (var j = i + 1; j < names.length; j++) {
        final a = HSLColor.fromColor(labels[names[i]]!).lightness;
        final b = HSLColor.fromColor(labels[names[j]]!).lightness;
        expect(
          (a - b).abs(),
          greaterThan(0.02),
          reason: '${names[i]} and ${names[j]} labels are too close in lightness',
        );
      }
    }
  });

  test('each status chip separates its label from its own fill', () {
    // A chip whose label sits close in lightness to its fill is unreadable
    // regardless of hue. Every pair here clears 0.4.
    const c = SortedColors.light;
    final chips = <String, (Color, Color)>{
      'Paid': (c.success, c.successTint),
      'Waiting': (c.warningText, c.warningTint),
      'Draft': (c.muted, c.neutralTint),
    };

    chips.forEach((name, pair) {
      final fg = HSLColor.fromColor(pair.$1).lightness;
      final bg = HSLColor.fromColor(pair.$2).lightness;
      expect(
        (fg - bg).abs(),
        greaterThan(0.4),
        reason: '$name label is too close in lightness to its own fill',
      );
    });
  });

  test('lerp returns a SortedColors so theme animation does not crash', () {
    final mid = SortedColors.light.lerp(SortedColors.light, 0.5);
    expect(mid, isA<SortedColors>());
  });

  test('shape constants match DESIGN.md', () {
    expect(SortedShape.screenPadding, 20.0);
    expect(SortedShape.primaryButtonHeight, 54.0);
    expect(SortedShape.primaryButtonRadius, 16.0);
    expect(SortedShape.statusChipHeight, 26.0);
    expect(SortedShape.selectableChipHeight, 40.0);
    expect(SortedShape.minTouchTarget, 44.0);
  });
}
