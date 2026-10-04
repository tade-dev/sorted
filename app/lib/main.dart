import 'package:flutter/material.dart';

import 'core/theme/sorted_colors.dart';
import 'core/theme/sorted_shape.dart';
import 'core/theme/sorted_theme.dart';

void main() {
  runApp(const SortedApp());
}

class SortedApp extends StatelessWidget {
  const SortedApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Sorted',
      theme: sortedTheme(),
      home: const _ThemePlaceholder(),
    );
  }
}

/// Stands in until Plan 2 builds the real screens. It exists so the theme is
/// exercised by a running app, not only by widget tests.
class _ThemePlaceholder extends StatelessWidget {
  const _ThemePlaceholder();

  @override
  Widget build(BuildContext context) {
    final colors = SortedColors.of(context);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(SortedShape.screenPadding),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Sorted', style: text.headlineLarge),
              const SizedBox(height: 8),
              Text('From DM to paid. Sorted.', style: text.bodyLarge),
              const SizedBox(height: 24),
              Wrap(
                spacing: 8,
                children: [
                  _StatusChip(
                    label: 'Paid',
                    fill: colors.successTint,
                    ink: colors.success,
                  ),
                  _StatusChip(
                    label: 'Waiting',
                    fill: colors.warningTint,
                    ink: colors.warningText,
                  ),
                  _StatusChip(
                    label: 'Draft',
                    fill: colors.neutralTint,
                    ink: colors.muted,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.fill, required this.ink});

  final String label;
  final Color fill;
  final Color ink;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: SortedShape.statusChipHeight,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: fill,
        borderRadius: BorderRadius.circular(SortedShape.pillRadius),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: ink,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }
}
