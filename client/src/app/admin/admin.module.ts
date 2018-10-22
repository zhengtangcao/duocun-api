import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { CommerceModule } from '../commerce/commerce.module';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { AccountModule } from '../account/account.module';
import { ProductModule } from '../product/product.module';
import { OrderModule } from '../order/order.module';
import { AdminComponent } from './admin.component';
import { AdminProductListComponent } from './admin-product-list/admin-product-list.component';
import { AdminProductFormPageComponent } from './admin-product-form-page/admin-product-form-page.component';


// import { AdminRestaurantFormPageComponent } from './admin-restaurant-form-page/admin-restaurant-form-page.component';
import { AdminRestaurantPageComponent } from './admin-restaurant-page/admin-restaurant-page.component';
import { AdminOrderPageComponent } from './admin-order-page/admin-order-page.component';
import { AdminProductPageComponent } from './admin-product-page/admin-product-page.component';
import { EditRestaurantComponent } from './edit-restaurant/edit-restaurant.component';
import { AdminCategoryPageComponent } from './admin-category-page/admin-category-page.component';
import { AdminAccountPageComponent } from './admin-account-page/admin-account-page.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ToastrModule } from 'ngx-toastr';

@NgModule({
    imports: [
        CommonModule,
        BrowserAnimationsModule,
        ToastrModule.forRoot(),
        NgbModule,
        FormsModule,
        ReactiveFormsModule,
        RestaurantModule,
        AccountModule,
        ProductModule,
        OrderModule,
        CommerceModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    declarations: [AdminComponent,
        AdminAccountPageComponent,
        // AdminRestaurantFormPageComponent,
        AdminProductListComponent,
        AdminRestaurantPageComponent,
        AdminOrderPageComponent,
        AdminProductPageComponent,
        AdminProductFormPageComponent,
        EditRestaurantComponent,
        AdminCategoryPageComponent
      ],
    exports: [AdminComponent, EditRestaurantComponent]
})
export class AdminModule { }
