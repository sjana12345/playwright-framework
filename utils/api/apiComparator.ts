export type DiffType = 'ADDED' | 'REMOVED' | 'MODIFIED';

export interface FieldDifference {
  path: string;
  type: DiffType;
  qaValue: any;
  prodValue: any;
  message: string;
}

export interface ComparisonOptions {
  ignoreFields?: string[]; // field names or paths to ignore, e.g. ['timestamp', 'traceId']
  ignoreArrayOrder?: boolean;
}

export interface ComparisonResult {
  isMatch: boolean;
  totalDifferences: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  differences: FieldDifference[];
  qaData: any;
  prodData: any;
}

export class ApiComparator {
  /**
   * Compares two JSON response payloads and returns all differences.
   */
  public static compare(
    qaResponse: any,
    prodResponse: any,
    options: ComparisonOptions = {}
  ): ComparisonResult {
    const differences: FieldDifference[] = [];
    const ignoreSet = new Set((options.ignoreFields || []).map((f) => f.toLowerCase()));

    this.deepCompare('', qaResponse, prodResponse, ignoreSet, differences, options);

    const addedCount = differences.filter((d) => d.type === 'ADDED').length;
    const removedCount = differences.filter((d) => d.type === 'REMOVED').length;
    const modifiedCount = differences.filter((d) => d.type === 'MODIFIED').length;

    return {
      isMatch: differences.length === 0,
      totalDifferences: differences.length,
      addedCount,
      removedCount,
      modifiedCount,
      differences,
      qaData: qaResponse,
      prodData: prodResponse,
    };
  }

  private static deepCompare(
    currentPath: string,
    valQA: any,
    valProd: any,
    ignoreSet: Set<string>,
    differences: FieldDifference[],
    options: ComparisonOptions
  ): void {
    const fieldName = currentPath.split('.').pop() || '';
    if (fieldName && (ignoreSet.has(fieldName.toLowerCase()) || ignoreSet.has(currentPath.toLowerCase()))) {
      return;
    }

    // Both are undefined or null
    if (valQA === valProd) {
      return;
    }

    // One is undefined (missing key)
    if (valQA === undefined && valProd !== undefined) {
      differences.push({
        path: currentPath || 'root',
        type: 'ADDED',
        qaValue: undefined,
        prodValue: valProd,
        message: `Field exists in Prod but is missing in QA`,
      });
      return;
    }

    if (valQA !== undefined && valProd === undefined) {
      differences.push({
        path: currentPath || 'root',
        type: 'REMOVED',
        qaValue: valQA,
        prodValue: undefined,
        message: `Field exists in QA but is missing in Prod`,
      });
      return;
    }

    // Check for type mismatch
    const typeQA = typeof valQA;
    const typeProd = typeof valProd;

    if (typeQA !== typeProd || valQA === null || valProd === null) {
      if (valQA !== valProd) {
        differences.push({
          path: currentPath || 'root',
          type: 'MODIFIED',
          qaValue: valQA,
          prodValue: valProd,
          message: `Type or null mismatch: QA is ${typeQA} (${JSON.stringify(valQA)}), Prod is ${typeProd} (${JSON.stringify(valProd)})`,
        });
      }
      return;
    }

    // Arrays comparison
    if (Array.isArray(valQA) && Array.isArray(valProd)) {
      const maxLen = Math.max(valQA.length, valProd.length);
      if (valQA.length !== valProd.length) {
        differences.push({
          path: `${currentPath}.length`,
          type: 'MODIFIED',
          qaValue: valQA.length,
          prodValue: valProd.length,
          message: `Array length mismatch: QA has ${valQA.length} items, Prod has ${valProd.length} items`,
        });
      }

      for (let i = 0; i < maxLen; i++) {
        const itemPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`;
        this.deepCompare(itemPath, valQA[i], valProd[i], ignoreSet, differences, options);
      }
      return;
    }

    // Objects comparison
    if (typeQA === 'object') {
      const keysQA = Object.keys(valQA);
      const keysProd = Object.keys(valProd);
      const allKeys = Array.from(new Set([...keysQA, ...keysProd]));

      for (const key of allKeys) {
        const nextPath = currentPath ? `${currentPath}.${key}` : key;
        this.deepCompare(nextPath, valQA[key], valProd[key], ignoreSet, differences, options);
      }
      return;
    }

    // Primitive values
    if (valQA !== valProd) {
      differences.push({
        path: currentPath || 'root',
        type: 'MODIFIED',
        qaValue: valQA,
        prodValue: valProd,
        message: `Value mismatch: QA="${valQA}" vs Prod="${valProd}"`,
      });
    }
  }
}

