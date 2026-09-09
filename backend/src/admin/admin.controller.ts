import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminService } from './admin.service';

/** Every route here additionally requires the ADMIN role on top of the global AuthGuard (see AppModule). */
@UseGuards(RolesGuard)
@Roles('ADMIN')
@Controller('admin/users')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list() {
    return this.admin.listUsers();
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.admin.approve(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.admin.reject(id);
  }
}
