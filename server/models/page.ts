import { DB } from "../db";
import { Model, Code } from "./model";

export enum PageStatus {
  DRAFT="draft",
  PUBLISH="publish"
}

export interface IPage {
  _id: string;
  title: string;
  titleEN?: string;
  slug: string;
  description: string;
  descriptionEN?: string;
  keywords?: string;
  content: string;
  contentEN?: string;
  status: PageStatus;
}

export class Page extends Model {
  constructor(dbo:DB) {
    super(dbo, 'pages');
  }
}