import { BadRequestError } from 'routing-controllers';
import { toSafeString } from 'giga-ai-helper';
import { OrganisationEntity } from '@connectingmatrix/orm/repositories/entities';
import { fetchChatSession } from '@connectingmatrix/chat/services/chat/auth/get-chat-session';
import { boolProp, jsonProp, schema, stringProp } from './common';
import type { GigaMcpContext } from '../context';
import type { GigaMcpToolGroup } from './common';

const org = (organizationId: unknown) => OrganisationEntity.load(toSafeString(organizationId)) as OrganisationEntity;

const writeBase64File = (context: GigaMcpContext, args: Record<string, unknown>) =>
  org(args.organizationId).sharedSpace.writeFile(context, {
    path: toSafeString(args.path),
    contentBase64: toSafeString(args.contentBase64),
  });

const downloadUrl = (context: GigaMcpContext, args: Record<string, unknown>) =>
  org(args.organizationId).sharedSpace.downloadUrl(context, {
    path: toSafeString(args.path),
    url: toSafeString(args.url),
    checksum: toSafeString(args.checksum) || null,
  });

const chatAttachmentToDrive = async (context: GigaMcpContext, args: Record<string, unknown>) => {
  const organizationId = toSafeString(args.organizationId);
  const destinationPath = toSafeString(args.path);
  if (!organizationId || !destinationPath) throw new BadRequestError('organizationId and path are required.');

  const attachment =
    args.attachment && typeof args.attachment === 'object' && !Array.isArray(args.attachment) ? (args.attachment as Record<string, unknown>) : null;
  const contentBase64 = toSafeString(args.contentBase64 || attachment?.contentBase64 || attachment?.content_base64);
  const sourceUrl = toSafeString(args.sourceUrl || args.source_url || attachment?.sourceUrl || attachment?.source_url || attachment?.url);
  const drivePath = toSafeString(args.drivePath || args.drive_path || attachment?.drivePath || attachment?.drive_path);

  if (args.dryRun === true) return { action: 'chat_attachment_to_drive', organizationId, path: destinationPath };
  if (contentBase64) return org(organizationId).sharedSpace.writeFile(context, { path: destinationPath, contentBase64 });
  if (sourceUrl) return org(organizationId).sharedSpace.downloadUrl(context, { path: destinationPath, url: sourceUrl });
  if (drivePath) return org(organizationId).sharedSpace.copy(context, { fromPath: drivePath, toPath: destinationPath });

  const chatId = toSafeString(args.chatId);
  if (chatId) {
    const session = await fetchChatSession(context.supabase, { chatId });
    const metadata = session?.metadata && typeof session.metadata === 'object' ? (session.metadata as Record<string, unknown>) : {};
    const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
    const index = Math.max(0, Number(args.attachmentIndex) || 0);
    return chatAttachmentToDrive(context, { ...args, chatId: '', attachment: attachments[index] || {} });
  }

  throw new BadRequestError('Attachment contentBase64, sourceUrl, drivePath, or chatId metadata is required.');
};

export const sharedSpaceMcpTools: GigaMcpToolGroup = {
  handlers: {
    'giga.shared_space_summary': (context, args) => org(args.organizationId).sharedSpace.summary(context),
    'giga.shared_space_list': (context, args) => org(args.organizationId).sharedSpace.files(context, { path: toSafeString(args.path) || '/drive' }),
    'giga.shared_space_stat': (context, args) => org(args.organizationId).sharedSpace.stat(context, { path: toSafeString(args.path) }),
    'giga.shared_space_mkdir': async (context, args) => {
      if (args.dryRun === true) return { action: 'mkdir', path: args.path };
      return org(args.organizationId).sharedSpace.createFolder(context, { path: toSafeString(args.path) });
    },
    'giga.shared_space_checksum': (context, args) => org(args.organizationId).sharedSpace.stat(context, { path: toSafeString(args.path) }),
    'giga.shared_space_write_json': async (context, args) => {
      if (args.dryRun === true) return { action: 'write_json', path: args.path };
      return org(args.organizationId).sharedSpace.writeFile(context, { path: toSafeString(args.path), json: args.json });
    },
    'giga.shared_space_write_file': async (context, args) =>
      args.dryRun === true ? { action: 'write_file', path: args.path } : writeBase64File(context, args),
    'giga.shared_space_download_url': async (context, args) =>
      args.dryRun === true ? { action: 'download_url', path: args.path, url: args.url } : downloadUrl(context, args),
    'giga.shared_space_copy': async (context, args) => {
      if (args.dryRun === true) return { action: 'copy', fromPath: args.fromPath, toPath: args.toPath };
      return org(args.organizationId).sharedSpace.copy(context, { fromPath: toSafeString(args.fromPath), toPath: toSafeString(args.toPath) });
    },
    'giga.shared_space_move': async (context, args) => {
      if (args.dryRun === true) return { action: 'move', fromPath: args.fromPath, toPath: args.toPath };
      return org(args.organizationId).sharedSpace.move(context, { fromPath: toSafeString(args.fromPath), toPath: toSafeString(args.toPath) });
    },
    'giga.shared_space_delete': async (context, args) => {
      if (args.dryRun === true) return { action: 'delete', path: args.path };
      return org(args.organizationId).sharedSpace.deletePath(context, { path: toSafeString(args.path) });
    },
    'giga.ensure_drive_artifact': async (context, args) =>
      args.dryRun === true ? { action: 'download_url', path: args.path, url: args.url } : downloadUrl(context, args),
    'giga.chat_attachment_to_drive': chatAttachmentToDrive,
  },
  tools: [
    {
      name: 'giga.shared_space_summary',
      description: 'Read organization /drive quota, usage, and permission summary.',
      inputSchema: schema({ organizationId: stringProp('Organization id') }, ['organizationId']),
    },
    {
      name: 'giga.shared_space_list',
      description: 'List files in organization /drive.',
      inputSchema: schema({ organizationId: stringProp('Organization id'), path: stringProp('/drive path') }, ['organizationId']),
    },
    {
      name: 'giga.shared_space_stat',
      description: 'Read metadata and checksum for a /drive path.',
      inputSchema: schema({ organizationId: stringProp('Organization id'), path: stringProp('/drive path') }, ['organizationId', 'path']),
    },
    {
      name: 'giga.shared_space_mkdir',
      description: 'Create a folder in organization /drive.',
      inputSchema: schema({ organizationId: stringProp('Organization id'), path: stringProp('/drive path'), dryRun: boolProp('Preview') }, [
        'organizationId',
        'path',
      ]),
    },
    {
      name: 'giga.shared_space_checksum',
      description: 'Return checksum metadata for a /drive file.',
      inputSchema: schema({ organizationId: stringProp('Organization id'), path: stringProp('/drive path') }, ['organizationId', 'path']),
    },
    {
      name: 'giga.shared_space_write_json',
      description: 'Write compact JSON to /drive.',
      inputSchema: schema(
        { organizationId: stringProp('Organization id'), path: stringProp('/drive path'), json: jsonProp('JSON body'), dryRun: boolProp('Preview') },
        ['organizationId', 'path'],
      ),
    },
    {
      name: 'giga.shared_space_write_file',
      description: 'Write a bounded base64 file to /drive.',
      inputSchema: schema(
        {
          organizationId: stringProp('Organization id'),
          path: stringProp('/drive path'),
          contentBase64: stringProp('Base64 file content'),
          dryRun: boolProp('Preview'),
        },
        ['organizationId', 'path', 'contentBase64'],
      ),
    },
    {
      name: 'giga.shared_space_download_url',
      description: 'Download an http(s) URL into /drive.',
      inputSchema: schema(
        {
          organizationId: stringProp('Organization id'),
          path: stringProp('/drive path'),
          url: stringProp('URL'),
          checksum: stringProp('Expected checksum'),
          dryRun: boolProp('Preview'),
        },
        ['organizationId', 'path', 'url'],
      ),
    },
    {
      name: 'giga.shared_space_copy',
      description: 'Copy a /drive file.',
      inputSchema: schema(
        {
          organizationId: stringProp('Organization id'),
          fromPath: stringProp('Source'),
          toPath: stringProp('Destination'),
          dryRun: boolProp('Preview'),
        },
        ['organizationId', 'fromPath', 'toPath'],
      ),
    },
    {
      name: 'giga.shared_space_move',
      description: 'Move or rename a /drive file or folder.',
      inputSchema: schema(
        {
          organizationId: stringProp('Organization id'),
          fromPath: stringProp('Source'),
          toPath: stringProp('Destination'),
          dryRun: boolProp('Preview'),
        },
        ['organizationId', 'fromPath', 'toPath'],
      ),
    },
    {
      name: 'giga.shared_space_delete',
      description: 'Delete a /drive file or folder.',
      inputSchema: schema({ organizationId: stringProp('Organization id'), path: stringProp('/drive path'), dryRun: boolProp('Preview') }, [
        'organizationId',
        'path',
      ]),
    },
    {
      name: 'giga.ensure_drive_artifact',
      description: 'Idempotently cache a URL artifact in organization /drive.',
      inputSchema: schema(
        {
          organizationId: stringProp('Organization id'),
          path: stringProp('/drive path'),
          url: stringProp('URL'),
          checksum: stringProp('Expected checksum'),
          dryRun: boolProp('Preview'),
        },
        ['organizationId', 'path', 'url'],
      ),
    },
    {
      name: 'giga.chat_attachment_to_drive',
      description: 'Copy a chat attachment, source URL, base64 fixture, or existing drive ref into organization /drive.',
      inputSchema: schema(
        {
          organizationId: stringProp('Organization id'),
          path: stringProp('/drive destination'),
          chatId: stringProp('Chat id with attachment metadata'),
          attachmentIndex: jsonProp('Attachment index'),
          attachment: jsonProp('Attachment object'),
          contentBase64: stringProp('Base64 file content'),
          sourceUrl: stringProp('Source URL'),
          drivePath: stringProp('Existing /drive source path'),
          dryRun: boolProp('Preview'),
        },
        ['organizationId', 'path'],
      ),
    },
  ],
};
