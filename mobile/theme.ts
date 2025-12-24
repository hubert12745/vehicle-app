// Shared theme and helper styles for the mobile app
import { StyleSheet } from 'react-native';

export const COLORS = {
  background: '#F4F6FB',
  card: '#FFFFFF',
  primary: '#0A84FF',
  accent: '#00C853',
  danger: '#FF3B30',
  text: '#0B2545',
  muted: '#6B7280',
  soft: '#F1F5F9',
};

export default StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  cardElevated: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 6,
  },

  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, textAlign: 'left', marginBottom: 8 },
  headerSubtitle: { fontSize: 14, color: COLORS.muted, textAlign: 'left', marginBottom: 12 },

  sectionHeader: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 8 },

  input: {
    borderWidth: 1,
    borderColor: '#e6eef8',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
    color: COLORS.text,
  },

  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },

  secondaryBtn: {
    backgroundColor: COLORS.soft,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: COLORS.text, fontWeight: '600' },

  ghostBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6eef8',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  ghostBtnText: { color: COLORS.text, fontWeight: '600' },

  smallLink: { color: COLORS.primary, textAlign: 'center', marginTop: 8 },

  mutedText: { color: COLORS.muted },
});
