import { StyleSheet } from 'react-native';

export default StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafbfc' },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restartButton: { backgroundColor: '#F59E0B', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  restartButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  addButton: { backgroundColor: '#10B981', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },

  /* Center states */
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: '#ef4444', fontSize: 16 },

  /* Board */
  board: { padding: 12, paddingBottom: 100 },
  fullColumn: { marginBottom: 16, borderRadius: 12, padding: 12, minHeight: 200 },
  fullColumnCollapsed: { marginBottom: 16, borderRadius: 12, padding: 12, minHeight: 80 },
  columnHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  exploringHeader: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  columnTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  caretIcon: { fontSize: 14, color: '#6b7280', marginLeft: 8, marginRight: 8 },
  columnCount: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  columnContent: { flex: 1 },
  collapsedText: { textAlign: 'center', marginTop: 8, fontSize: 14, color: '#9ca3af', fontStyle: 'italic' },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 14, color: '#9ca3af', fontStyle: 'italic' },
  
  /* Column drop zone highlight */
  columnDropZone: {
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
  },

  /* Tasks */
  taskRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  card: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    marginRight: 8,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#fff', lineHeight: 20 },
  cardNotes: { fontSize: 13, color: '#fff', marginTop: 2, lineHeight: 16, opacity: 0.85 },
  sandwichMenu: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', borderRadius: 8 },
  sandwichMenuIcon: { fontSize: 18, color: '#6b7280' },

  /* Bottom dock */
  bottomDock: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 5,
  },
  dockButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12 },
  dockButtonActive: { backgroundColor: '#f3f4f6' },
  dockIcon: { fontSize: 24, marginBottom: 4 },
  dockLabel: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  dockLabelActive: { color: '#374151', fontWeight: '600' },

  /* Task overlay */
  overlayBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  overlayContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxHeight: '80%' },
  overlayTask: { borderRadius: 12, padding: 20, marginBottom: 24 },
  overlayTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12, lineHeight: 28 },
  overlayNotes: { fontSize: 16, color: '#374151', marginBottom: 16, lineHeight: 24 },
  overlayState: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  overlayActions: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  overlayActionButton: { backgroundColor: '#f3f4f6', paddingHorizontal: 24, paddingVertical: 16, borderRadius: 12, alignItems: 'center', minWidth: 100 },
  overlayActionIcon: { fontSize: 24, marginBottom: 8 },
  overlayActionText: { fontSize: 16, fontWeight: '600', color: '#374151' },

  /* Modals */
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  /* 2×2 square grid – fixed */
  stateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  stateButton: { width: '48%', paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  stateButtonActive: { borderColor: '#111827' },
  stateButtonText: { fontSize: 14, fontWeight: '700' },
  input: { backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#111827', marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  addButtonModal: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#10B981', alignItems: 'center' },
  addButtonModalText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});