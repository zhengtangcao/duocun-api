import { Component, OnInit, ViewChild, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, FormControl, FormArray, Validators } from '@angular/forms';
import { LocationService } from '../../shared/location/location.service';
import { RestaurantService } from '../restaurant.service';
import { MultiImageUploaderComponent } from '../../shared/multi-image-uploader/multi-image-uploader.component';
import { environment } from '../../../environments/environment';
import { NgRedux } from '@angular-redux/store';
import { IPicture } from '../../commerce/commerce.actions';
import { AccountService } from '../../account/account.service';
import { GeoPoint, Restaurant, Category, LoopBackConfig, Address, Account } from '../../shared/lb-sdk';
import { ILocation } from '../../shared/location/location.model';
import { getComponentViewDefinitionFactory } from '../../../../node_modules/@angular/core/src/view';

const APP = environment.APP;
const PICTURES_FOLDER = 'pictures';

@Component({
  selector: 'app-restaurant-form',
  templateUrl: './restaurant-form.component.html',
  styleUrls: ['./restaurant-form.component.scss']
})
export class RestaurantFormComponent implements OnInit, OnChanges {

  currentAccount: Account;
  location: ILocation = {
    street_name: '',
    street_number: '',
    sub_locality: '',
    city: '',
    province: '',
    postal_code: '',
    lat: 0,
    lng: 0
  };

  address = '';
  id = '';
  categoryList: Category[] = [];
  picture;
  subscriptionPicture;
  form: FormGroup;
  users;
  uploadedPictures: string[] = [];
  uploadUrl: string = [
    LoopBackConfig.getPath(),
    LoopBackConfig.getApiVersion(),
    'Containers/pictures/upload'
  ].join('/');

  @Output() afterSave: EventEmitter<any> = new EventEmitter();
  @Input() restaurant: Restaurant;
  @ViewChild(MultiImageUploaderComponent) uploader: any;

  createForm() {
    return this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', Validators.maxLength(750)],
      // street: ['', Validators.required],
      // postal_code:['', Validators.required]
      address: this.fb.group({
        // street: ['', [Validators.required]],
        unit: ['', [Validators.required]],
        postalCode: ['', [Validators.required]],
      }),
      ownerId: new FormControl(), // ['', Validators.required]
      // categories: this.fb.array([]),
      // delivery_fee: ''
    });
  }

  constructor(private fb: FormBuilder,
    private accountSvc: AccountService,
    private restaurantSvc: RestaurantService,
    private locationSvc: LocationService,
    private router: Router, private route: ActivatedRoute,
    private rx: NgRedux<IPicture>) {

    this.form = this.createForm();
  }

  ngOnInit() {
    const self = this;

    if (this.restaurant && this.restaurant.id) {
      this.uploadedPictures = (this.restaurant.pictures || []).map(pic => pic.url);
      this.form.patchValue(this.restaurant);
      if (this.restaurant.address) {
        const addr = this.restaurant.address;
        this.location.city = addr.city;
        this.location.street_name = addr.streetName;
        this.location.street_number = addr.streetNumber;
        this.location.sub_locality = addr.sublocality;
        this.location.postal_code = addr.postalCode;
        this.location.province = addr.province;
        this.location.lat = addr.location.lat;
        this.location.lng = addr.location.lng;

        this.form.get('address').get('street').setValue(this.restaurant.address.formattedAddress);
        this.form.get('address').get('unit').setValue(this.restaurant.address.unit);
        this.form.get('address').get('postalCode').setValue(this.restaurant.address.postalCode);
      }
    }

    // localStorage.setItem('restaurant_info-' + APP, JSON.stringify(self.restaurant));
    // self.pictures = [{ index: 0, name: '', image: this.restaurant.image }];

    // self.route.params.subscribe((params:any)=>{
    // self.commerceServ.getRestaurant(params.id).subscribe(
    //     (r:Restaurant) => {
    //     	self.restaurant = r;
    //     	self.id = r.id;
    //         self.form.patchValue(r);
    //         self.street.patchValue(r.address.street);

    //         if(r.image && r.image.data){
    //         	self.pictures = [{index:0, name:"", image:r.image}];
    //         }else{
    //         	self.pictures = [];
    //         }

    //         self.commerceServ.getCategoryList().subscribe(catList=>{
    //       self.categoryList = catList;
    //       for(let cat of catList){
    //           let c = r.categories.find(x=> x.id==cat.id );
    //           if(c){
    //               self.categories.push(new FormControl(true));
    //           }else{
    //               self.categories.push(new FormControl(false));
    //           }
    //           //self.categories.push(new FormControl(s.id));
    //       }
    //   })
    //     },
    //     (err:any) => {
    //     });

    this.accountSvc.getCurrent().subscribe((acc: Account) => {
      this.currentAccount = acc;
      if (acc.type === 'super') {
        self.accountSvc.find({ where: { type: 'business' } }).subscribe(users => {
          self.users = users;
        });
      }
    });

  }

  ngOnChanges(changes) {
    if (this.form && changes.restaurant.currentValue.id) {
      this.form.patchValue(changes.restaurant.currentValue);

      const addr = changes.restaurant.currentValue.address;
      if (addr) {
        this.location.city = addr.city;
        this.location.street_name = addr.streetName;
        this.location.street_number = addr.streetNumber;
        this.location.sub_locality = addr.sublocality;
        this.location.postal_code = addr.postalCode;
        this.location.province = addr.province;
        this.location.lat = addr.location.lat;
        this.location.lng = addr.location.lng;

        this.address = this.locationSvc.getAddrString(this.location);
      }
    }
  }

  // callback of app-address-input
  onAddressChange(e) {
    // localStorage.setItem('location-' + APP, JSON.stringify(e.addr));
    this.location = e.addr;
    this.address = e.sAddr;
    this.form.get('address').patchValue({ postalCode: this.location.postal_code });
    // this.sharedSvc.emitMsg({ name: 'OnUpdateAddress', addr: e.addr });
  }

  onUploadFinished(event) {
    try {
      const self = this;
      const res = JSON.parse(event.serverResponse.response._body);
      this.restaurant.pictures = res.result.files.image.map(img => {
        return {
          name: self.restaurant.name,
          url: [
            LoopBackConfig.getPath(),
            LoopBackConfig.getApiVersion(),
            'Containers',
            img.container, // pictures folder
            img.name
          ].join('/')
        };
      });
    } catch (error) {
      console.error(error);
    }
  }

  onRemoved(event) {
    this.restaurant.pictures.splice(this.restaurant.pictures.findIndex(pic => pic.url === event.file.src));
  }

  save() {
    // This component will be used for business admin and super admin!
    const self = this;
    const v = this.form.value;
    const restaurant = new Restaurant(this.form.value);
    if (!this.users || !this.users.length) {
      restaurant.ownerId = this.currentAccount.id;
    }

    restaurant.pictures = this.restaurant.pictures;
    restaurant.location = { lat: this.location.lat, lng: this.location.lng };
    restaurant.address = new Address({
      id: this.restaurant.address ? this.restaurant.address.id : null,
      streetName: this.location.street_name,
      streetNumber: this.location.street_number,
      sublocality: this.location.sub_locality,
      city: this.location.city,
      province: this.location.province,
      formattedAddress: this.locationSvc.getAddrString(this.location),
      unit: this.form.get('address').get('unit').value,
      postalCode: this.location.postal_code,
      location: {
        lat: this.location.lat,
        lng: this.location.lng
      },
    }); // {
    // city: ''
    // });
    // hardcode Toronto as default
    // if (self.restaurant && self.restaurant.address) {
    //   addr = self.restaurant.address;
    //   addr.formattedAddress = v.address.street;
    // } else {
    //   addr = new Address({
    //     city: 'Toronto',
    //     province: 'ON',
    //     formattedAddress: v.address.street,
    //     unit: null,
    //     postalCode: v.address.postal_code
    //   });
    // }


    // if (self.picture) {
    //     restaurant.image = self.picture.image;
    // }
    restaurant.location = { lat: this.location.lat, lng: this.location.lng };
    restaurant.id = self.restaurant ? self.restaurant.id : null;
    if (restaurant.id) {
      self.restaurantSvc.replaceById(restaurant.id, restaurant).subscribe((r: any) => {
        // self.router.navigate(['admin']);
        self.afterSave.emit({ restaurant: r, action: 'update' });
      });
    } else {
      self.restaurantSvc.create(restaurant).subscribe((r: any) => {
        // self.router.navigate(['admin']);
        self.afterSave.emit({ restaurant: r, action: 'save' });
      });
    }
    // const sAddr = addr.formattedAddress + ', Toronto, ' + v.address.postalCode;
    // this.locationSvc.getLocation(sAddr).subscribe(ret => {
    //   if (ret) {
    //     addr.location = { lat: ret.lat, lng: ret.lng };
    //     addr.sublocality = ret.sub_locality;
    //     addr.postalCode = ret.postal_code;

    //     restaurant.location = { lat: ret.lat, lng: ret.lng };
    //   }
    //   restaurant.address = addr;

    //   if (restaurant.id) {
    //     self.restaurantSvc.replaceById(restaurant.id, restaurant).subscribe((r: any) => {
    //       // self.router.navigate(['admin']);
    //       self.afterSave.emit({ restaurant: r });
    //     });
    //   } else {
    //     self.restaurantSvc.create(restaurant).subscribe((r: any) => {
    //       // self.router.navigate(['admin']);
    //       self.afterSave.emit({ restaurant: r });
    //     });
    //   }

    // });

  }

  cancel() {
    const self = this;

    // const c = localStorage.getItem('restaurant_info-' + APP);
    // const r = JSON.parse(c);

    self.form.patchValue(this.restaurant);
    // self.pictures = [{ index: 0, name: '', image: this.restaurant.image }];

    // localStorage.removeItem('restaurant_info-' + APP);

    self.router.navigate(['admin']);
  }
}
