import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { Visibility } from '../../common/enums';

export class CreateChannelDto {
  @IsUrl({}, { message: 'channelUrl must be a valid URL' })
  channelUrl: string;

  @IsString()
  uploadConfigId: string;

  @IsEnum(Visibility)
  @IsOptional()
  defaultVisibility?: Visibility;

  @IsString()
  @IsOptional()
  titleTemplate?: string;

  @IsString()
  @IsOptional()
  playlistId?: string;

  /** Display-only snapshot of the playlist's name at pick-time (in case it's later renamed). */
  @IsString()
  @IsOptional()
  playlistTitle?: string;
}
