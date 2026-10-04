import 'package:flutter/material.dart';

/// The design tokens from docs/design/DESIGN.md that Material's ColorScheme
/// has no home for. Read via SortedColors.of(context); never hardcode a hex
/// value in a widget.
@immutable
class SortedColors extends ThemeExtension<SortedColors> {
  const SortedColors({
    required this.background,
    required this.surface,
    required this.ink,
    required this.muted,
    required this.line,
    required this.primary,
    required this.primaryTint,
    required this.success,
    required this.successTint,
    required this.highlight,
    required this.warningTint,
    required this.warningText,
    required this.warningBorder,
    required this.neutralTint,
    required this.darkBg,
    required this.darkSurface,
    required this.darkTrack,
    required this.darkLink,
    required this.onDarkMuted,
    required this.accentCyan,
    required this.paidBar,
  });

  final Color background;
  final Color surface;
  final Color ink;
  final Color muted;
  final Color line;
  final Color primary;
  final Color primaryTint;
  final Color success;
  final Color successTint;
  final Color highlight;
  final Color warningTint;
  final Color warningText;
  final Color warningBorder;
  final Color neutralTint;
  final Color darkBg;
  final Color darkSurface;
  final Color darkTrack;
  final Color darkLink;
  final Color onDarkMuted;
  final Color accentCyan;
  final Color paidBar;

  static const light = SortedColors(
    background: Color(0xFFF5F7FA),
    surface: Color(0xFFFFFFFF),
    ink: Color(0xFF001C64),
    muted: Color(0xFF515A6B),
    line: Color(0xFFDCE2EA),
    primary: Color(0xFF0070E0),
    primaryTint: Color(0xFFE6F0FC),
    success: Color(0xFF147A47),
    successTint: Color(0xFFE3F4EA),
    highlight: Color(0xFFFFC439),
    warningTint: Color(0xFFFFF4D6),
    warningText: Color(0xFF7A5200),
    warningBorder: Color(0xFFF1D27A),
    neutralTint: Color(0xFFEBEEF3),
    darkBg: Color(0xFF00123F),
    darkSurface: Color(0xFF0B2A78),
    darkTrack: Color(0xFF0F3488),
    darkLink: Color(0xFF123C96),
    onDarkMuted: Color(0xFFB9C8EE),
    accentCyan: Color(0xFF60CDFF),
    paidBar: Color(0xFF5BD08F),
  );

  static SortedColors of(BuildContext context) =>
      Theme.of(context).extension<SortedColors>() ?? light;

  @override
  SortedColors copyWith({
    Color? background,
    Color? surface,
    Color? ink,
    Color? muted,
    Color? line,
    Color? primary,
    Color? primaryTint,
    Color? success,
    Color? successTint,
    Color? highlight,
    Color? warningTint,
    Color? warningText,
    Color? warningBorder,
    Color? neutralTint,
    Color? darkBg,
    Color? darkSurface,
    Color? darkTrack,
    Color? darkLink,
    Color? onDarkMuted,
    Color? accentCyan,
    Color? paidBar,
  }) {
    return SortedColors(
      background: background ?? this.background,
      surface: surface ?? this.surface,
      ink: ink ?? this.ink,
      muted: muted ?? this.muted,
      line: line ?? this.line,
      primary: primary ?? this.primary,
      primaryTint: primaryTint ?? this.primaryTint,
      success: success ?? this.success,
      successTint: successTint ?? this.successTint,
      highlight: highlight ?? this.highlight,
      warningTint: warningTint ?? this.warningTint,
      warningText: warningText ?? this.warningText,
      warningBorder: warningBorder ?? this.warningBorder,
      neutralTint: neutralTint ?? this.neutralTint,
      darkBg: darkBg ?? this.darkBg,
      darkSurface: darkSurface ?? this.darkSurface,
      darkTrack: darkTrack ?? this.darkTrack,
      darkLink: darkLink ?? this.darkLink,
      onDarkMuted: onDarkMuted ?? this.onDarkMuted,
      accentCyan: accentCyan ?? this.accentCyan,
      paidBar: paidBar ?? this.paidBar,
    );
  }

  @override
  SortedColors lerp(ThemeExtension<SortedColors>? other, double t) {
    if (other is! SortedColors) return this;
    Color c(Color a, Color b) => Color.lerp(a, b, t)!;
    return SortedColors(
      background: c(background, other.background),
      surface: c(surface, other.surface),
      ink: c(ink, other.ink),
      muted: c(muted, other.muted),
      line: c(line, other.line),
      primary: c(primary, other.primary),
      primaryTint: c(primaryTint, other.primaryTint),
      success: c(success, other.success),
      successTint: c(successTint, other.successTint),
      highlight: c(highlight, other.highlight),
      warningTint: c(warningTint, other.warningTint),
      warningText: c(warningText, other.warningText),
      warningBorder: c(warningBorder, other.warningBorder),
      neutralTint: c(neutralTint, other.neutralTint),
      darkBg: c(darkBg, other.darkBg),
      darkSurface: c(darkSurface, other.darkSurface),
      darkTrack: c(darkTrack, other.darkTrack),
      darkLink: c(darkLink, other.darkLink),
      onDarkMuted: c(onDarkMuted, other.onDarkMuted),
      accentCyan: c(accentCyan, other.accentCyan),
      paidBar: c(paidBar, other.paidBar),
    );
  }
}
