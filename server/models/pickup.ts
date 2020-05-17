import moment from 'moment';
import { DB } from "../db";
import { Model } from "./model";
import { ObjectId, Collection } from "mongodb";

export class Pickup extends Model {
  constructor(dbo: DB) {
    super(dbo, 'pickups');
  }

  async getById(id: string, options: any={}) {
    if (id && ObjectId.isValid(id)) {
      const r = await this.findOne({ _id: id }, options);
      if (r) {
        return r;
      }
    }
    return null;
  }

  // this function will do upsert ?
  async updateOne(query: any, doc: any, options?: any): Promise<any> {
    if (Object.keys(doc).length === 0 && doc.constructor === Object) {
      return;
    } else {
      query = this.convertIdFields(query);
      doc = this.convertIdFields(doc);

      const c: Collection = await this.getCollection();
      const r: any = await c.updateOne(query, { $set: doc }, options);
      return r.result;
    }
  }

  async insertOne(doc: any): Promise<any> {
    const c: Collection = await this.getCollection();
    doc = this.convertIdFields(doc);
    if(!doc.created){
      doc.created = moment().toISOString();
    }
    doc.modified = moment().toISOString();
    const result = await c.insertOne(doc); // InsertOneWriteOpResult
    const ret = (result.ops && result.ops.length > 0) ? result.ops[0] : null;
    return ret;
  }

  async deleteOne(query: any, options?: object): Promise<any> {
    const c: Collection = await this.getCollection();
    const q = this.convertIdFields(query);
    return await c.deleteOne(q, options); // DeleteWriteOpResultObject {ok, n}
  }

  // return BulkWriteOpResultObject
  async bulkUpdate(items: any[], options?: any): Promise<any> {
    const c: Collection = await this.getCollection();
    const clonedArray: any[] = [...items];
    const a: any[] = [];

    clonedArray.map(({query, data}) => {
      const q = this.convertIdFields(query);
      const doc = this.convertIdFields(data);
      a.push({ updateOne: { filter: q, update: { $set: doc }, upsert: true } });
    });

    return await c.bulkWrite(a, options);
  }
}