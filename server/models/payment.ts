
import { DB } from "../db";
import { Model } from "./model";

export class Payment extends Model {
  constructor(dbo: DB) {
    super(dbo, 'payments');
  }
}