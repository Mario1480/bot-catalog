import { parse } from "csv-parse";
import { Readable } from "stream";

// English comment: Parse CSV into objects using headers.
export async function parseCsv(buffer: Buffer): Promise<any[]> {
  const records: any[] = [];
  const parser = parse({ columns: true, skip_empty_lines: true, trim: true });

  return new Promise((resolve, reject) => {
    Readable.from(buffer)
      .pipe(parser)
      .on("data", (row) => records.push(row))
      .on("end", () => resolve(records))
      .on("error", reject);
  });
}