import { IsString, IsOptional } from 'class-validator';

export class IncomingSmsDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}
