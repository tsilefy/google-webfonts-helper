import * as _ from "lodash";
import * as mkdirp from "mkdirp";
import { config } from "../config";
import { IFontFilePath } from "./fetchFontFiles";
import { IVariantItem } from "./fetchFontURLs";
import { fetchGoogleFonts, IFontItem } from "./fetchGoogleFonts";

// FontBundle holds:
// * the found stored font from google,
// * the requested (and found) subsets and
// * the unique storeID to access Maps in the store.
// It should be used as the sole way to interact with the store and must be build via store.getFontBundle
export interface IFontBundle {
  storeID: string;
  subsets: string[];
  font: IFontItem;
}

const fontMap = new Map<string, IFontItem>();
const urlMap = new Map<string, IVariantItem[]>();
const fileMap = new Map<string, IFontFilePath[]>();

export async function initStore() {
  await mkdirp(config.CACHE_DIR);

  _.each(await fetchGoogleFonts(), (font: IFontItem) => {
    fontMap.set(font.id, font);
  });
}

export async function reinitStore() {
  if (config.ENV !== "test") {
    console.warn("reinitStore was called, building fresh stores...");
  }

  fontMap.clear();
  urlMap.clear();
  fileMap.clear();

  return initStore();
}

export function getStoredFontItems(): IFontItem[] {
  return Array.from(fontMap.values());
}

export function getFontBundle(fontID: string, wantedSubsets: string[] | null): IFontBundle | null {
  const font = fontMap.get(fontID);

  if (_.isNil(font)) {
    return null;
  }

  const match =
    !_.isArray(wantedSubsets) || wantedSubsets.length === 0
      ? [font.defSubset] // supply filter with the default subset as defined in googleFontsAPI fetcher (latin or if no found other)
      : _.intersection(font.subsets, wantedSubsets);

  const subsets = _.sortBy(_.uniq(match));

  if (subsets.length === 0) {
    return null;
  }

  return {
    // not this must be a stable key fully identifying the font, its version and wantedSubsets
    storeID: `${font.id}@${font.version}__${subsets.join("_")}`,
    subsets,
    font,
  };
}

export function getStoredVariantItems({ storeID }: IFontBundle): IVariantItem[] | null {
  const variants = urlMap.get(storeID);
  if (_.isNil(variants)) {
    return null;
  }
  return variants;
}

export function getStoredFontFilePaths({ storeID }: IFontBundle): IFontFilePath[] | null {
  const paths = fileMap.get(storeID);
  if (_.isNil(paths)) {
    return null;
  }
  return paths;
}

export function storeVariantItems({ storeID }: IFontBundle, variants: IVariantItem[]) {
  const existings = urlMap.get(storeID);

  if (!_.isNil(existings)) {
    console.warn("storeVariantItems: duplicate save of storeID: ", storeID);
    if (config.ENV === "test") {
      throw new Error("storeVariantItems duplicate write");
    }
    return;
  }

  urlMap.set(storeID, variants);
}

export function storeFontFilePaths({ storeID }: IFontBundle, fontFilePaths: IFontFilePath[]) {
  const existings = fileMap.get(storeID);

  if (!_.isNil(existings)) {
    console.warn("storeFontFilePaths: duplicate save of storeID: ", storeID);
    if (config.ENV === "test") {
      throw new Error("storeFontFilePaths duplicate write");
    }
    return;
  }

  fileMap.set(storeID, fontFilePaths);
}

export function getStats() {
  return {
    fontMap: fontMap.size,
    urlMap: urlMap.size,
    fileMap: fileMap.size,
    urls: _.sumBy(Array.from(urlMap.values()), function (f) {
      return f ? f.length : 0;
    }),
    files: _.sumBy(Array.from(fileMap.values()), function (f) {
      return f ? f.length : 0;
    }),
  };
}
