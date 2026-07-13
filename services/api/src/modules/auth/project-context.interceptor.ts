import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import type { AuthenticatedProjectRequest } from "./auth.guard.js";
import { runWithProjectContext } from "./project-context.js";

@Injectable()
export class ProjectContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AuthenticatedProjectRequest>();

    return new Observable((subscriber) => {
      let subscription: ReturnType<Observable<unknown>["subscribe"]> | undefined;
      runWithProjectContext({
        projectId: request.projectId,
        identity: request.authIdentity,
      }, () => {
        subscription = next.handle().subscribe(subscriber);
      });
      return () => subscription?.unsubscribe();
    });
  }
}
