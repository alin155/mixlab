import type {
  AdminCutterUserCommandRouteApiInput,
  AdminCutterUserCommandRouteDeps
} from "./admin-cutter-user-command-routes.ts";

interface CutterUserCommandContext<TActor> {
  library_root: string;
  now: string;
  actor?: TActor;
}

export interface CreateAdminCutterUserCommandRouteDepsInput<
  TApiInput extends AdminCutterUserCommandRouteApiInput,
  TActor,
  TApprovalCommandResult,
  TApprovalRouteResult,
  TUserRecord,
  TPublicUser
> {
  command_now: string;
  actor?: TActor;
  read_request_json(): Promise<unknown>;
  run_approve_cutter_user_command(
    input: CutterUserCommandContext<TActor> & { user_id: string }
  ): Promise<TApprovalCommandResult>;
  run_disable_cutter_user_command(
    input: CutterUserCommandContext<TActor> & { user_id: string }
  ): Promise<TUserRecord>;
  run_reset_cutter_user_password_command(
    input: CutterUserCommandContext<TActor> & {
      user_id: string;
      new_password: string;
    }
  ): Promise<TUserRecord>;
  project_approve_result(result: TApprovalCommandResult): TApprovalRouteResult;
  project_public_user(user: TUserRecord): TPublicUser;
}

export function createAdminCutterUserCommandRouteDeps<
  TApiInput extends AdminCutterUserCommandRouteApiInput,
  TActor,
  TApprovalCommandResult,
  TApprovalRouteResult,
  TUserRecord,
  TPublicUser
>(
  input: CreateAdminCutterUserCommandRouteDepsInput<
    TApiInput,
    TActor,
    TApprovalCommandResult,
    TApprovalRouteResult,
    TUserRecord,
    TPublicUser
  >
): AdminCutterUserCommandRouteDeps<TApiInput, TApprovalRouteResult, TPublicUser> {
  function commandContext(apiInput: TApiInput): CutterUserCommandContext<TActor> {
    return {
      library_root: apiInput.library_root,
      now: input.command_now,
      actor: input.actor
    };
  }

  return {
    read_request_json: input.read_request_json,
    async run_approve_cutter_user({ api_input, user_id }) {
      return input.project_approve_result(await input.run_approve_cutter_user_command({
        ...commandContext(api_input),
        user_id
      }));
    },
    async run_disable_cutter_user({ api_input, user_id }) {
      return input.project_public_user(await input.run_disable_cutter_user_command({
        ...commandContext(api_input),
        user_id
      }));
    },
    async run_reset_cutter_user_password({ api_input, user_id, new_password }) {
      return input.project_public_user(await input.run_reset_cutter_user_password_command({
        ...commandContext(api_input),
        user_id,
        new_password
      }));
    }
  };
}

type ApproveCutterUserCommandService<
  TApiInput extends AdminCutterUserCommandRouteApiInput,
  TActor,
  TApprovalCommandResult,
  TApprovalRouteResult,
  TUserRecord,
  TPublicUser
> = CreateAdminCutterUserCommandRouteDepsInput<
  TApiInput,
  TActor,
  TApprovalCommandResult,
  TApprovalRouteResult,
  TUserRecord,
  TPublicUser
>["run_approve_cutter_user_command"];

type DisableCutterUserCommandService<
  TApiInput extends AdminCutterUserCommandRouteApiInput,
  TActor,
  TApprovalCommandResult,
  TApprovalRouteResult,
  TUserRecord,
  TPublicUser
> = CreateAdminCutterUserCommandRouteDepsInput<
  TApiInput,
  TActor,
  TApprovalCommandResult,
  TApprovalRouteResult,
  TUserRecord,
  TPublicUser
>["run_disable_cutter_user_command"];

type ResetCutterUserPasswordCommandService<
  TApiInput extends AdminCutterUserCommandRouteApiInput,
  TActor,
  TApprovalCommandResult,
  TApprovalRouteResult,
  TUserRecord,
  TPublicUser
> = CreateAdminCutterUserCommandRouteDepsInput<
  TApiInput,
  TActor,
  TApprovalCommandResult,
  TApprovalRouteResult,
  TUserRecord,
  TPublicUser
>["run_reset_cutter_user_password_command"];

export interface CreateAdminCutterUserCommandRouteServerDepsInput<
  TApiInput extends AdminCutterUserCommandRouteApiInput,
  TActor,
  TApprovalCommandResult,
  TApprovalRouteResult,
  TUserRecord,
  TPublicUser
> extends Omit<
    CreateAdminCutterUserCommandRouteDepsInput<
      TApiInput,
      TActor,
      TApprovalCommandResult,
      TApprovalRouteResult,
      TUserRecord,
      TPublicUser
    >,
    | "run_approve_cutter_user_command"
    | "run_disable_cutter_user_command"
    | "run_reset_cutter_user_password_command"
  > {
  run_approve_cutter_user_service: ApproveCutterUserCommandService<
    TApiInput,
    TActor,
    TApprovalCommandResult,
    TApprovalRouteResult,
    TUserRecord,
    TPublicUser
  >;
  run_disable_cutter_user_service: DisableCutterUserCommandService<
    TApiInput,
    TActor,
    TApprovalCommandResult,
    TApprovalRouteResult,
    TUserRecord,
    TPublicUser
  >;
  run_reset_cutter_user_password_service: ResetCutterUserPasswordCommandService<
    TApiInput,
    TActor,
    TApprovalCommandResult,
    TApprovalRouteResult,
    TUserRecord,
    TPublicUser
  >;
}

export function createAdminCutterUserCommandRouteServerDeps<
  TApiInput extends AdminCutterUserCommandRouteApiInput,
  TActor,
  TApprovalCommandResult,
  TApprovalRouteResult,
  TUserRecord,
  TPublicUser
>(
  input: CreateAdminCutterUserCommandRouteServerDepsInput<
    TApiInput,
    TActor,
    TApprovalCommandResult,
    TApprovalRouteResult,
    TUserRecord,
    TPublicUser
  >
): AdminCutterUserCommandRouteDeps<TApiInput, TApprovalRouteResult, TPublicUser> {
  return createAdminCutterUserCommandRouteDeps({
    ...input,
    run_approve_cutter_user_command: input.run_approve_cutter_user_service,
    run_disable_cutter_user_command: input.run_disable_cutter_user_service,
    run_reset_cutter_user_password_command: input.run_reset_cutter_user_password_service
  });
}
