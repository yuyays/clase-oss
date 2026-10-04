export const NEW_ASSESSMENT_ID = '__new__';

export const getEditorUploadParsingGateKey = (assessmentId: string) =>
  `editor-upload-parsing-gate:${assessmentId}`;
