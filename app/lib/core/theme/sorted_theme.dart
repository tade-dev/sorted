import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'sorted_colors.dart';
import 'sorted_shape.dart';

ThemeData sortedTheme() {
  const c = SortedColors.light;

  final display = GoogleFonts.bricolageGrotesqueTextTheme();
  final body = GoogleFonts.plusJakartaSansTextTheme();

  return ThemeData(
    useMaterial3: true,
    scaffoldBackgroundColor: c.background,
    colorScheme: ColorScheme.fromSeed(
      seedColor: c.primary,
      primary: c.primary,
      surface: c.surface,
      error: const Color(0xFFB3261E),
    ),
    extensions: const <ThemeExtension<dynamic>>[c],
    textTheme: TextTheme(
      // Bricolage Grotesque: wordmark, hero numbers, headings.
      displayLarge: display.displayLarge?.copyWith(
        fontWeight: FontWeight.w700,
        fontSize: 68,
        color: c.ink,
      ),
      headlineLarge: display.headlineLarge?.copyWith(
        fontWeight: FontWeight.w700,
        fontSize: 32,
        letterSpacing: -0.8,
        color: c.ink,
      ),
      headlineMedium: display.headlineMedium?.copyWith(
        fontWeight: FontWeight.w700,
        fontSize: 28,
        letterSpacing: -0.6,
        color: c.ink,
      ),
      titleLarge: display.titleLarge?.copyWith(
        fontWeight: FontWeight.w700,
        fontSize: 19,
        color: c.ink,
      ),
      // Plus Jakarta Sans: body, labels, captions.
      bodyLarge: body.bodyLarge?.copyWith(fontSize: 16, height: 1.5, color: c.ink),
      bodyMedium: body.bodyMedium?.copyWith(fontSize: 15, height: 1.45, color: c.muted),
      labelLarge: body.labelLarge?.copyWith(fontSize: 17, fontWeight: FontWeight.w600),
      labelMedium: body.labelMedium?.copyWith(fontSize: 14, fontWeight: FontWeight.w600),
      bodySmall: body.bodySmall?.copyWith(fontSize: 13, color: c.muted),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.primary,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(SortedShape.primaryButtonHeight),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SortedShape.primaryButtonRadius),
        ),
      ),
    ),
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SortedShape.cardRadius),
        side: BorderSide(color: c.line),
      ),
    ),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
  );
}
