import { SitemapStream, streamToPromise } from "sitemap";
import { Config } from "../config";
import { Page, IPage } from "../models/page";
import { Product, IProduct } from "../models/product";
import { Category } from "../models/category";
import { DB } from "../db";
import slugify from "slugify";
import fs from "fs";
const smStream = new SitemapStream({
  hostname: "https://duocun.ca",
});

const config = new Config();
const dbo = new DB();

dbo.init(config.DATABASE).then(async () => {
  console.log("Begin writing sitemap");
  await writeSitemap();
  console.log("End writing");
  setTimeout(() => {
    process.exit(0);
  }, 5000);
});

const writeSitemap = async () => {
  const writeStream = fs.createWriteStream("./sitemap.xml");
  smStream.pipe(writeStream);
  await addStaticPages();
  await addCategoryPages();
  await addProductPages();
  smStream.end();
  // smStream.on("end", () => {
  //   console.log("End writing");
  //   process.exit();
  // });
  // smStream.on("error", (e) => {
  //   console.error(e);
  //   process.exit(1);
  // });
};

const addStaticPages = async () => {
  let count = 0;
  smStream.write({
    url: "/tabs/login",
  });
  count++;
  smStream.write({
    url: "/tabs/register",
  });
  count++;
  smStream.write({
    url: "/tabs/search",
  });
  count++;
  smStream.write({
    url: "/tabs/browse/all-categories",
  });
  count++;
  const pageModel = new Page(dbo);
  const pages = await pageModel.find({
    status: "publish",
  });
  pages.forEach((page: IPage) => {
    smStream.write({
      url: page.slug,
    });
    count++;
  });
  console.log(`${count} static page(s) have been written to sitemap`);
};

const addCategoryPages = async () => {
  const categoryModel = new Category(dbo);
  const categories = await categoryModel.find({
    status: "A",
    type: "G",
  });
  let count = 0;
  categories.forEach((category: any) => {
    const slug = getSlugFromModel(category);
    if (slug) {
      smStream.write({
        url: `/tabs/browse/categories/${slug}/${category._id.toString()}`,
      });
    } else {
      smStream.write({
        url: `/tabs/browse/categories/${category._id.toString()}`,
      });
    }
    count++;
  });
  console.log(`${count} category page(s) have been written to sitemap`);
};

const addProductPages = async () => {
  const productModel = new Product(dbo);
  const products = await productModel.find({
    status: "A",
    type: "G",
  });
  let count = 0;
  products.forEach((product: IProduct) => {
    const slug = getSlugFromModel(product);
    const url = slug
      ? `/tabs/browse/products/${slug}/${product._id}`
      : `/tabs/browse/products/${product._id}`;
    const img: any[] = [];
    if (product.pictures) {
      product.pictures.forEach((picture) => {
        img.push({
          url: "https://duocun.com.cn/media/" + picture.url,
          title: product.name + " | " + "多村 - Duocun",
        });
      });
    }
    smStream.write({
      url,
      img,
    });
    count++;
  });
  console.log(`${count} product page(s) have been written to sitemap`);
};

const getSlugFromModel = (model: any) => {
  if (!model) return "";
  if (!model.nameEN) {
    return "";
  }
  return slugify(model.nameEN, {
    lower: true,
  });
};
