export type ParsingJobPayload = {
  assetId: string;
  testId: string;
  fileUrl: string;
  fileType: 'pdf' | 'docx';
};
