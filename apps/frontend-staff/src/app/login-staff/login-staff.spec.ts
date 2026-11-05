import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { LoginStaff } from './login-staff';

describe('LoginStaff', () => {
  let component: LoginStaff;
  let fixture: ComponentFixture<LoginStaff>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginStaff],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginStaff);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
