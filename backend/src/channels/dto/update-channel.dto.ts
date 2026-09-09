import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Visibility } from '../../common/enums';

/**
 * Everything here is optional -- the identity fields (channelUrl/channelId)
 * are deliberately NOT editable; changing which YouTube channel is being
 * monitored is a remove-and-re-add, not an edit, since it affects polling,
 * job history, and the resolved channelId.
 *
 * playlistId/playlistTitle accept an empty string to mean "clear the
 * playlist" (mapped to null in ChannelsService.update) -- keeping the DTO
 * fields plain strings avoids class-validator's stricter null handling.
 */
export class UpdateChannelDto {
  @IsString()
  @IsOptional()
  uploadConfigId?: string;

  @IsEnum(Visibility)
  @IsOptional()
  defaultVisibility?: Visibility;

  @IsString()
  @IsOptional()
  titleTemplate?: string;

  @IsString()
  @IsOptional()
  playlistId?: string;

  @IsString()
  @IsOptional()
  playlistTitle?: string;
}
