import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UploadConfigsService } from './upload-configs.service';

/** Configuration of upload destinations is restricted entirely to ADMIN. */
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('upload-configs')
export class UploadConfigsController {
  constructor(private readonly service: UploadConfigsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id/playlists')
  listPlaylists(@Param('id') id: string) {
    return this.service.listPlaylists(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
