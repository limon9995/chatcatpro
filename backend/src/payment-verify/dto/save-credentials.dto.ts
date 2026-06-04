import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class SaveCredentialsDto {
  @IsIn(['bkash', 'nagad', 'sslcommerz', 'shurjopay', 'zinipay'])
  method: string;

  @IsObject()
  credentials: Record<string, string>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
