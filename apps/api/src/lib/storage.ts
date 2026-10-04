import path from 'node:path';

const FALLBACK_FILENAME = 'asset-file';

const decodeLikelyLatin1Utf8Mojibake = (value: string) => {
  const decoded = Buffer.from(value, 'latin1').toString('utf8');
  if (decoded.includes('\uFFFD')) {
    return value;
  }

  return /[^\x00-\x7f]/.test(decoded) ? decoded : value;
};

const toSafeExtension = (fileName: string) => {
  const extension = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,16}$/.test(extension) ? extension : '';
};

export const buildAssetPath = (input: {
  assessmentId: string;
  assetId: string;
  originalName: string;
}) => {
  const decodedOriginalName = decodeLikelyLatin1Utf8Mojibake(input.originalName);
  const baseName = path.basename(decodedOriginalName).trim();
  const normalizedName =
    baseName && baseName !== '.' && baseName !== '..'
      ? baseName.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '')
      : FALLBACK_FILENAME;
  const safeName = `upload${toSafeExtension(normalizedName || FALLBACK_FILENAME)}`;

  return `assessments/${input.assessmentId}/${input.assetId}/${safeName}`;
};
