import express, { Request, Response } from "express";
import { DB } from "../db";
import { Product, ProductStatus } from "../models/product";
import { Model, Code } from "../models/model";
import { ObjectId } from "mongodb";

export function ProductRouter(db: DB){
  const router = express.Router();
  const model = new Product(db);
  const controller = new ProductController(db);
  
  // grocery api
  router.get('/G/:id', (req, res) => { controller.gv1_get(req, res); });
  router.get('/G/', (req, res) => { controller.gv1_list(req, res); });

  // admin api /products/admin
  router.get('/admin', (req, res) => { controller.av1_list(req, res); });


  // old api
  router.get('/', (req, res) => { controller.list(req, res); });
  router.get('/paginate/:page/:size', (req, res) => { controller.paginate(req, res) });
  router.get('/qFind', (req, res) => { model.quickFind(req, res); });
  router.get('/clearImage', (req, res) => { model.clearImage(req, res); });
  router.get('/categorize', (req, res) => { model.categorize(req, res); });
  router.get('/:id', (req, res) => { model.get(req, res); });
  router.post('/', (req, res) => { model.create(req, res); });
  router.put('/', (req, res) => { model.replace(req, res); });
  router.patch('/', (req, res) => { model.update(req, res); });
  router.delete('/', (req, res) => { model.remove(req, res); });

  return router;
};

class ProductController extends Model{
  model: Product;

  constructor(db: DB) {
    super(db, 'products');
    this.model = new Product(db);
  }


  async list(req: Request, res: Response) {
    let query:any = {};
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
    } else {
      query = req.query;
      if (query) {
        query = JSON.parse(query.query);
        query.type = 'G';
      } else {
        query = {type: 'G'};
      }
    }
    query.status = ProductStatus.ACTIVE;
    const ps = await this.model.list(query);
    res.setHeader('Content-Type', 'application/json');
    res.send(ps);
  }

  async paginate(req: Request, res: Response) {
    let query:any = {};
    if (req.headers && req.headers.filter && typeof req.headers.filter === 'string') {
      query = (req.headers && req.headers.filter) ? JSON.parse(req.headers.filter) : null;
      query = {...query, type: 'G', status:'A'};
    } else {
      query = req.query;
      if (query && query.query) {
        query = JSON.parse(query.query);
        query.type = 'G';
        query.status ='A';
      } else {
        query = {type: 'G', status:'A'};
      }
    }
    let page = parseInt(req.params.page);
    let size = parseInt(req.params.size);
    if (page < 1) page = 1;
    if (size < 1) size = 1;
    const limit = size;
    const skip = (page - 1) * size;
    try {
      if (query.categoryId) {
        query.categoryId = new ObjectId(query.categoryId);
      }
      if (query.merchantId && query.merchantId['$in']) {
        query.merchantId['$in'] = query.merchantId['$in'].map((id: string) => new ObjectId(id));
      }
    } catch (e) {
      res.setHeader('Content-Type', 'application/json');
      res.send({
        code: Code.FAIL
      });
    }
    
    const collection = await this.model.getCollection();
    const data = await collection.find(query, { skip, limit, sort: [["rank", -1]] }).toArray();
    const count = await collection.find(query).count();
    res.setHeader('Content-Type', 'application/json');
    res.send({
      code: Code.SUCCESS,
      data,
      meta: {
        page,
        size,
        count
      }
    });
  }

  gv1_list(req: Request, res: Response) {
    // const status = req.query.status;
    const merchantId = req.query.merchantId;
    const query = {status: 'A', type: 'G'}; // status ? {status, type: 'G'} : {type: 'G'};
    res.setHeader('Content-Type', 'application/json');

    merchantId ? 
    this.model.joinFind({...query, merchantId}).then((products: any[]) => {
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: products 
      }));
    })
    :
    res.send(JSON.stringify({
      code: Code.FAIL,
      data: [] 
    }));
  }

  gv1_get(req: Request, res: Response) {
    const id = req.params.id;
    this.model.getById(id).then(product => {
      res.setHeader('Content-Type', 'application/json');
      res.send(JSON.stringify({
        code: product ? Code.SUCCESS : Code.FAIL,
        data: product 
      }));
    });
  }


  av1_list(req: Request, res: Response) {
    res.setHeader('Content-Type', 'application/json');
    this.model.joinFind({}).then((products: any[]) => {
      res.send(JSON.stringify({
        code: Code.SUCCESS,
        data: products 
      }));
    });
  }
}