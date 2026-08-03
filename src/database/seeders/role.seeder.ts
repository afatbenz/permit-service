/**
 * Standalone seeder — inserts the fixed system roles if they don't exist
 * yet. Run this once after applying the DDL scripts and before hitting
 * POST /organizations (createOrganization looks up the 'org_admin' role
 * and will fail with a 500 if it hasn't been seeded).
 *
 * Usage: npm run seed:roles
 */
import 'dotenv/config';
import { Sequelize } from 'sequelize-typescript';
import { Role } from '../models/role.model';
import { Organization } from '../models/organization.model';
import { User } from '../models/user.model';
import { SubconCompany } from '../models/subcon-company.model';
import { Project } from '../models/project.model';
import { UserProfile } from '../models/user-profile.model';
import { RegistrationLink } from '../models/registration-link.model';
import { OrganizationInvite } from '../models/organization-invite.model';
import { RoleCode } from '../../common/enums/role-code.enum';

const SYSTEM_ROLES: Array<{ code: RoleCode; name: string; description: string }> = [
  { code: RoleCode.SUPER_ADMIN, name: 'Super Admin', description: 'Platform-wide administrator' },
  { code: RoleCode.ORG_ADMIN, name: 'Organization Admin', description: 'Manages users and master data within one organization' },
  { code: RoleCode.SUPERVISOR_SUBCON, name: 'Supervisor - Sub-Contractor', description: 'Submits permit applications (Step A)' },
  { code: RoleCode.SUPERVISOR_MAINCON, name: 'Supervisor - Main Contractor', description: 'Reviews permit applications (Step B)' },
  { code: RoleCode.HSE_MAINCON, name: 'HSE - Main Contractor', description: 'Reviews permit + mandatory notes (Step C)' },
  { code: RoleCode.CM_MAINCON, name: 'CM - Main Contractor', description: 'Final approval (Step D)' },
];

async function run() {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    models: [Organization, Role, SubconCompany, Project, User, UserProfile, RegistrationLink, OrganizationInvite],
    define: { underscored: true, timestamps: true },
    logging: false,
  });

  await sequelize.authenticate();

  for (const roleDef of SYSTEM_ROLES) {
    const [role, created] = await Role.findOrCreate({
      where: { code: roleDef.code, organizationId: null as any },
      defaults: {
        code: roleDef.code,
        name: roleDef.name,
        description: roleDef.description,
        isSystemRole: true,
      } as any,
    });

    // eslint-disable-next-line no-console
    console.log(created ? `Created role: ${role.code}` : `Role already exists: ${role.code}`);
  }

  await sequelize.close();
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Role seeding complete.');
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Role seeding failed:', err);
    process.exit(1);
  });
