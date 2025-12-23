// Shared theme and helper styles for the mobile app
import { StyleSheet } from 'react-native';

export const COLORS = {
  background: '#F6F8FB',
  card: '#FFFFFF',
  primary: '#2E86DE',
  accent: '#2ECC71',
  danger: '#E74C3C',
  text: '#2C3E50',
  muted: '#7F8C8D',
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

  headerTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 8 },
  headerSubtitle: { fontSize: 14, color: COLORS.muted, textAlign: 'center', marginBottom: 12 },

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

  ghostBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6eef8',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  ghostBtnText: { color: COLORS.text, fontWeight: '600' },

  smallLink: { color: COLORS.primary, textAlign: 'center', marginTop: 8 },
});

