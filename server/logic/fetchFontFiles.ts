import * as Bluebird from "bluebird";
import * as fs from "fs";
import * as _ from "lodash";
import * as path from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { config } from "../config";
import { asyncRetry } from "../utils/asyncRetry";
import { IVariantItem } from "./fetchFontURLs";

const RETRIES = 5;

export interface IFontFilePath {
  variant: string;
  format: string;
  path: string;
}

export async function fetchFontFiles(fontID: string, fontVersion: string, variants: IVariantItem[]): Promise<IFontFilePath[]> {
  const filePaths: IFontFilePath[] = [];

  await Bluebird.map(variants, async (variant) => {
    await Bluebird.map(variant.urls, async (variantUrl) => {
      const filename = path.join(
        config.CACHE_DIR,
        `/${fontID}-${fontVersion}-${variant.subsets.join("_")}-${variant.id}.${variantUrl.format}`
      );

      // download the file for type (filename now known)
      try {
        await downloadFile(variantUrl.url, filename, variantUrl.format);
      } catch (e) {
        // if a specific format does not work, silently discard it.
        console.error("fetchFontFiles discarding", fontID, variant.subsets.join("_"), variantUrl.url, variantUrl.format, filename, e);
        return;
      }

      filePaths.push({
        variant: variant.id, // variants and format are used to filter them out later!
        format: variantUrl.format,
        path: filename,
      });
    });
  });

  return filePaths;
}

async function downloadFile(url: string, dest: string, format: string) {
  await asyncRetry(
    async () => {
      const response = await fetch(url);
      const contentType = response.headers.get("content-type");

      if (response.status !== 200) {
        throw new Error(`${url} downloadFile request failed. status code: ${response.status} ${response.statusText}`);
      }

      if (_.isNil(contentType) || _.isEmpty(contentType) || contentType.indexOf(format) === -1) {
        throw new Error(`${url} downloadFile request failed. expected ${format} to be in content-type header: ${contentType}`);
      }

      const stream = fs.createWriteStream(dest);
      // TODO typing mismatch ReadableStream<any> vs ReadableStream<Uint8Array>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await finished(Readable.fromWeb(<any>response.body).pipe(stream));
    },
    { retries: RETRIES }
  );
}
