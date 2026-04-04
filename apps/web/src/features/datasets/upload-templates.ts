import type { DatasetKind } from '@platform/types';

export function downloadUploadTemplate(kind: DatasetKind): void {
  let fileName = 'dataset-template.csv';
  let content = 'feature_a,feature_b,target\n1,2,2.1\n2,3,3.4\n';
  let mimeType = 'text/csv;charset=utf-8';

  if (kind === 'vector') {
    fileName = 'dataset-template.geojson';
    mimeType = 'application/geo+json;charset=utf-8';
    content = JSON.stringify(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { id: 1, class_name: 'sample' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [116.38, 39.9],
                  [116.4, 39.9],
                  [116.4, 39.92],
                  [116.38, 39.92],
                  [116.38, 39.9],
                ],
              ],
            },
          },
        ],
      },
      null,
      2,
    );
  }

  if (kind === 'raster' || kind === 'artifact') {
    fileName = `${kind}-upload-template.txt`;
    mimeType = 'text/plain;charset=utf-8';
    content =
      kind === 'raster'
        ? 'Upload a raster file such as .tif or .tiff. This template is a reminder file only.'
        : 'Upload a derived artifact such as .csv, .json, or .zip depending on the workflow output.';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
