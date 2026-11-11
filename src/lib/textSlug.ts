const dictionary: Record<string, string> = {
  确: "que",
  认: "ren",
  到: "dao",
  账: "zhang",
  记: "ji",
  录: "lu",
  保: "bao",
  存: "cun",
  报: "bao",
  告: "gao",
  草: "cao",
  稿: "gao",
  会: "hui",
  议: "yi",
  纪: "ji",
  要: "yao",
  收: "shou",
  集: "ji",
  二: "er",
  季: "ji",
  度: "du",
  经: "jing",
  营: "ying",
  数: "shu",
  据: "ju",
  补: "bu",
  齐: "qi",
  贴: "tie",
  申: "shen",
  资: "zi",
  料: "liao",
  法: "fa",
  务: "wu",
  专: "zhuan",
  利: "li",
  变: "bian",
  更: "geng",
  文: "wen",
  件: "jian",
  任: "ren",
  中: "zhong",
  心: "xin",
  西: "xi",
  安: "an",
  云: "yun",
  创: "chuang",
  业: "ye",
  绩: "ji",
  承: "cheng",
  诺: "nuo",
  监: "jian",
  控: "kong",
};

export function slugifyBusinessText(value: string) {
  return value
    .replace(/[:：]/g, " ")
    .match(/[A-Za-z0-9]+|[\u4e00-\u9fa5]|./g)!
    .map((token) => {
      if (/^[A-Za-z0-9]+$/.test(token)) return token.toLowerCase();
      if (/[\s/._-]/.test(token)) return "-";
      if (/[\u4e00-\u9fa5]/.test(token)) return dictionary[token] ?? `u${token.codePointAt(0)!.toString(16)}`;
      return "-";
    })
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
