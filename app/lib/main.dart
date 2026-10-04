import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/sorted_colors.dart';
import 'core/theme/sorted_shape.dart';
import 'core/theme/sorted_theme.dart';
import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const ProviderScope(child: SortedApp()));
}

/// Signs the seller in anonymously, which is what "instant demo seller, no
/// login" means in practice: a judge opens the hosted build and is already a
/// seller, with their own uid scoping their data away from every other judge.
final sellerIdProvider = FutureProvider<String>((ref) async {
  final auth = FirebaseAuth.instance;
  final existing = auth.currentUser;
  if (existing != null) return existing.uid;
  final credential = await auth.signInAnonymously();
  return credential.user!.uid;
});

class SortedApp extends StatelessWidget {
  const SortedApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Sorted',
      theme: sortedTheme(),
      home: const _SignInGate(),
    );
  }
}

/// Stands in until Plan 2 builds the real screens. It exists so sign-in and the
/// theme are exercised by a running app, not only by tests.
class _SignInGate extends ConsumerWidget {
  const _SignInGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = SortedColors.of(context);
    final text = Theme.of(context).textTheme;
    final seller = ref.watch(sellerIdProvider);

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
              switch (seller) {
                AsyncData(:final value) => Text(
                    'Signed in as $value',
                    style: text.bodySmall,
                  ),
                AsyncError(:final error) => Text(
                    'Could not sign in: $error',
                    style: text.bodySmall?.copyWith(color: colors.warningText),
                  ),
                _ => Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: colors.muted,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text('Signing in…', style: text.bodySmall),
                    ],
                  ),
              },
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
