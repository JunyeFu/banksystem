// Generated from contracts/openapi/agent-workbench-api.yaml. Do not edit.
export interface paths {
    "/bootstrap": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** getAgentBootstrap */
        get: operations["getAgentBootstrap"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/conversations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** listAgentConversations */
        get: operations["listAgentConversations"];
        put?: never;
        /** createAgentConversation */
        post: operations["createAgentConversation"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/conversations/{conversationId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getAgentConversation
         * @description Newest message page, displayed oldest-first; before/nextMessageCursor loads older messages. Include only turns linked from this page. Bound pages to the existing Harness/MCP byte budget, without truncating message text.
         */
        get: operations["getAgentConversation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/conversations/{conversationId}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * submitAgentMessage
         * @description Atomically persist the submission ID before execution; repeat IDs return the original turn, never replay the bank task. A different payload with the same ID returns 409.
         */
        post: operations["submitAgentMessage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/turns/{turnId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getAgentTurn
         * @description Read events after an immutable sequence, bounded by count and the existing Harness/MCP byte budget. hasMoreEvents indicates remaining events. Reads never resume or replay execution.
         */
        get: operations["getAgentTurn"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/turns/{turnId}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * cancelAgentTurn
         * @description Request Controller stop. STOP_REQUESTED is not a rollback or proof that a dispatched Worker stopped. Unknown bank results require authority readback and human intervention.
         */
        post: operations["cancelAgentTurn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/models": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** listAgentModels */
        get: operations["listAgentModels"];
        put?: never;
        /** createAgentModel */
        post: operations["createAgentModel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/models/{modelId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** updateAgentModel */
        put: operations["updateAgentModel"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/models/check": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * checkAgentModel
         * @description Probe exactly the selected endpoint. No fallback or hidden retry. Never echo provider errors or API keys.
         */
        post: operations["checkAgentModel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/models/{modelId}/default": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * setDefaultAgentModel
         * @description Default selection affects subsequent tasks only. Running turns retain their model/version/ReleaseIdentity snapshot.
         */
        put: operations["setDefaultAgentModel"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/attachments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * importAgentAttachment
         * @description Single PNG/JPEG binary import. X-Hengzhun-Filename contains a base64url UTF-8 filename, never a server path.
         */
        post: operations["importAgentAttachment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/turns/{turnId}/evidence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** getAgentTurnEvidence */
        get: operations["getAgentTurnEvidence"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/turns/{turnId}/artifacts/{artifactId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * downloadAgentArtifact
         * @description Download only an artifact in the turn Journey evidence. Internal one-time grant and service tokens never reach the browser.
         */
        get: operations["downloadAgentArtifact"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Problem: {
            /** @constant */
            type: "about:blank";
            title: string;
            status: number;
            code: string;
        };
    };
    responses: {
        /** @description Explicit failure; no raw dependency error or credential details. */
        Problem: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getAgentBootstrap: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description getAgentBootstrap */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        csrfToken: string;
                        /** @enum {string} */
                        status: "READY" | "NOT_READY";
                        releaseIdentityHash: string | null;
                        /** @constant */
                        environment: "LOCAL";
                        blockingReasons: string[];
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    listAgentConversations: {
        parameters: {
            query?: {
                q?: string;
                cursor?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description listAgentConversations */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        conversations: {
                            /** Format: uuid */
                            id: string;
                            title: string;
                            /** @enum {string} */
                            status: "IDLE" | "RUNNING" | "NEEDS_INPUT" | "COMPLETED" | "FAILED" | "STOP_REQUESTED" | "INTERRUPTED";
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                            lastTurnId: string | null;
                        }[];
                        nextCursor: string | null;
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    createAgentConversation: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    title: string;
                };
            };
        };
        responses: {
            /** @description createAgentConversation */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        title: string;
                        /** @enum {string} */
                        status: "IDLE" | "RUNNING" | "NEEDS_INPUT" | "COMPLETED" | "FAILED" | "STOP_REQUESTED" | "INTERRUPTED";
                        /** Format: date-time */
                        createdAt: string;
                        /** Format: date-time */
                        updatedAt: string;
                        lastTurnId: string | null;
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    getAgentConversation: {
        parameters: {
            query?: {
                before?: string;
                limit?: number;
            };
            header?: never;
            path: {
                conversationId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Newest message page, displayed oldest-first; before/nextMessageCursor loads older messages. Include only turns linked from this page. Bound pages to the existing Harness/MCP byte budget, without truncating message text. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        conversation: {
                            /** Format: uuid */
                            id: string;
                            title: string;
                            /** @enum {string} */
                            status: "IDLE" | "RUNNING" | "NEEDS_INPUT" | "COMPLETED" | "FAILED" | "STOP_REQUESTED" | "INTERRUPTED";
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                            lastTurnId: string | null;
                        };
                        messages: {
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            role: "user" | "assistant";
                            text: string;
                            /** Format: date-time */
                            createdAt: string;
                            turnId: string | null;
                        }[];
                        turns: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            conversationId: string;
                            version: number;
                            /** @enum {string} */
                            status: "RUNNING" | "NEEDS_INPUT" | "COMPLETED" | "FAILED" | "STOP_REQUESTED" | "INTERRUPTED";
                            /** Format: uuid */
                            inputMessageId: string;
                            modelBinding: {
                                /** Format: uuid */
                                profileId: string;
                                profileVersion: number;
                                model: string;
                                baseUrlHash: string;
                                releaseIdentityHash: string;
                            };
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            updatedAt: string;
                            checkpointSessionId?: string;
                            journeyId?: string;
                            runId?: string;
                            taskId?: string;
                            events: {
                                sequence: number;
                                /** @enum {string} */
                                type: "ACCEPTED" | "PLANNING" | "TOOL_STARTED" | "TOOL_FINISHED" | "NEEDS_INPUT" | "COMPLETED" | "FAILED" | "STOP_REQUESTED" | "INTERRUPTED";
                                summary: string;
                                /** Format: date-time */
                                createdAt: string;
                                toolName?: string;
                            }[];
                            hasMoreEvents: boolean;
                            answer?: string;
                            failureCode?: string;
                            humanInterventionRequired: boolean;
                            /** Format: uuid */
                            continuationOfTurnId?: string;
                            result: {
                                /** @enum {string} */
                                kind: "REPLY" | "TEST";
                                /** @enum {string} */
                                verdict: "NOT_RUN" | "PASSED" | "FAILED" | "UNKNOWN";
                            };
                        }[];
                        nextMessageCursor: string | null;
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    submitAgentMessage: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                conversationId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    submissionId: string;
                    input: string;
                    /** Format: uuid */
                    modelProfileId: string;
                    modelProfileVersion: number;
                    /** @default [] */
                    attachmentRefs?: string[];
                    attachmentMetadata?: {
                        attachmentRef: string;
                        originalFilename: string;
                    }[];
                };
            };
        };
        responses: {
            /** @description Atomically persist the submission ID before execution; repeat IDs return the original turn, never replay the bank task. A different payload with the same ID returns 409. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        conversationId: string;
                        version: number;
                        /** @enum {string} */
                        status: "RUNNING" | "NEEDS_INPUT" | "COMPLETED" | "FAILED" | "STOP_REQUESTED" | "INTERRUPTED";
                        /** Format: uuid */
                        inputMessageId: string;
                        modelBinding: {
                            /** Format: uuid */
                            profileId: string;
                            profileVersion: number;
                            model: string;
                            baseUrlHash: string;
                            releaseIdentityHash: string;
                        };
                        /** Format: date-time */
                        createdAt: string;
                        /** Format: date-time */
                        updatedAt: string;
                        checkpointSessionId?: string;
                        journeyId?: string;
                        runId?: string;
                        taskId?: string;
                        events: {
                            sequence: number;
                            /** @enum {string} */
                            type: "ACCEPTED" | "PLANNING" | "TOOL_STARTED" | "TOOL_FINISHED" | "NEEDS_INPUT" | "COMPLETED" | "FAILED" | "STOP_REQUESTED" | "INTERRUPTED";
                            summary: string;
                            /** Format: date-time */
                            createdAt: string;
                            toolName?: string;
                        }[];
                        hasMoreEvents: boolean;
                        answer?: string;
                        failureCode?: string;
                        humanInterventionRequired: boolean;
                        /** Format: uuid */
                        continuationOfTurnId?: string;
                        result: {
                            /** @enum {string} */
                            kind: "REPLY" | "TEST";
                            /** @enum {string} */
                            verdict: "NOT_RUN" | "PASSED" | "FAILED" | "UNKNOWN";
                        };
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    getAgentTurn: {
        parameters: {
            query?: {
                after?: number;
                limit?: number;
            };
            header?: never;
            path: {
                turnId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Read events after an immutable sequence, bounded by count and the existing Harness/MCP byte budget. hasMoreEvents indicates remaining events. Reads never resume or replay execution. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        conversationId: string;
                        version: number;
                        /** @enum {string} */
                        status: "RUNNING" | "NEEDS_INPUT" | "COMPLETED" | "FAILED" | "STOP_REQUESTED" | "INTERRUPTED";
                        /** Format: uuid */
                        inputMessageId: string;
                        modelBinding: {
                            /** Format: uuid */
                            profileId: string;
                            profileVersion: number;
                            model: string;
                            baseUrlHash: string;
                            releaseIdentityHash: string;
                        };
                        /** Format: date-time */
                        createdAt: string;
                        /** Format: date-time */
                        updatedAt: string;
                        checkpointSessionId?: string;
                        journeyId?: string;
                        runId?: string;
                        taskId?: string;
                        events: {
                            sequence: number;
                            /** @enum {string} */
                            type: "ACCEPTED" | "PLANNING" | "TOOL_STARTED" | "TOOL_FINISHED" | "NEEDS_INPUT" | "COMPLETED" | "FAILED" | "STOP_REQUESTED" | "INTERRUPTED";
                            summary: string;
                            /** Format: date-time */
                            createdAt: string;
                            toolName?: string;
                        }[];
                        hasMoreEvents: boolean;
                        answer?: string;
                        failureCode?: string;
                        humanInterventionRequired: boolean;
                        /** Format: uuid */
                        continuationOfTurnId?: string;
                        result: {
                            /** @enum {string} */
                            kind: "REPLY" | "TEST";
                            /** @enum {string} */
                            verdict: "NOT_RUN" | "PASSED" | "FAILED" | "UNKNOWN";
                        };
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    cancelAgentTurn: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                turnId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": Record<string, never>;
            };
        };
        responses: {
            /** @description Request Controller stop. STOP_REQUESTED is not a rollback or proof that a dispatched Worker stopped. Unknown bank results require authority readback and human intervention. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** Format: uuid */
                        conversationId: string;
                        version: number;
                        /** @enum {string} */
                        status: "RUNNING" | "NEEDS_INPUT" | "COMPLETED" | "FAILED" | "STOP_REQUESTED" | "INTERRUPTED";
                        /** Format: uuid */
                        inputMessageId: string;
                        modelBinding: {
                            /** Format: uuid */
                            profileId: string;
                            profileVersion: number;
                            model: string;
                            baseUrlHash: string;
                            releaseIdentityHash: string;
                        };
                        /** Format: date-time */
                        createdAt: string;
                        /** Format: date-time */
                        updatedAt: string;
                        checkpointSessionId?: string;
                        journeyId?: string;
                        runId?: string;
                        taskId?: string;
                        events: {
                            sequence: number;
                            /** @enum {string} */
                            type: "ACCEPTED" | "PLANNING" | "TOOL_STARTED" | "TOOL_FINISHED" | "NEEDS_INPUT" | "COMPLETED" | "FAILED" | "STOP_REQUESTED" | "INTERRUPTED";
                            summary: string;
                            /** Format: date-time */
                            createdAt: string;
                            toolName?: string;
                        }[];
                        hasMoreEvents: boolean;
                        answer?: string;
                        failureCode?: string;
                        humanInterventionRequired: boolean;
                        /** Format: uuid */
                        continuationOfTurnId?: string;
                        result: {
                            /** @enum {string} */
                            kind: "REPLY" | "TEST";
                            /** @enum {string} */
                            verdict: "NOT_RUN" | "PASSED" | "FAILED" | "UNKNOWN";
                        };
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    listAgentModels: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description listAgentModels */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        models: {
                            /** Format: uuid */
                            id: string;
                            version: number;
                            displayName: string;
                            model: string;
                            /** Format: uri */
                            baseUrl: string;
                            keyConfigured: boolean;
                            isDefault: boolean;
                        }[];
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    createAgentModel: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    displayName: string;
                    model: string;
                    /** Format: uri */
                    baseUrl: string;
                    apiKey?: string;
                };
            };
        };
        responses: {
            /** @description createAgentModel */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        version: number;
                        displayName: string;
                        model: string;
                        /** Format: uri */
                        baseUrl: string;
                        keyConfigured: boolean;
                        isDefault: boolean;
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    updateAgentModel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                modelId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    displayName: string;
                    model: string;
                    /** Format: uri */
                    baseUrl: string;
                    apiKey?: string;
                    version: number;
                };
            };
        };
        responses: {
            /** @description updateAgentModel */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        version: number;
                        displayName: string;
                        model: string;
                        /** Format: uri */
                        baseUrl: string;
                        keyConfigured: boolean;
                        isDefault: boolean;
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    checkAgentModel: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    model: string;
                    /** Format: uri */
                    baseUrl: string;
                    apiKey?: string;
                    /** Format: uuid */
                    profileId?: string;
                    profileVersion?: number;
                };
            };
        };
        responses: {
            /** @description Probe exactly the selected endpoint. No fallback or hidden retry. Never echo provider errors or API keys. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "READY" | "FAILED";
                        code: string;
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    setDefaultAgentModel: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                modelId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    version: number;
                };
            };
        };
        responses: {
            /** @description Default selection affects subsequent tasks only. Running turns retain their model/version/ReleaseIdentity snapshot. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        version: number;
                        displayName: string;
                        model: string;
                        /** Format: uri */
                        baseUrl: string;
                        keyConfigured: boolean;
                        isDefault: boolean;
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    importAgentAttachment: {
        parameters: {
            query?: never;
            header: {
                "X-Hengzhun-Filename": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "image/png": string;
                "image/jpeg": string;
            };
        };
        responses: {
            /** @description Single PNG/JPEG binary import. X-Hengzhun-Filename contains a base64url UTF-8 filename, never a server path. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        attachmentRef: string;
                        sha256: string;
                        size: number;
                        originalFilename: string;
                        /** @enum {string} */
                        mediaType: "image/png" | "image/jpeg";
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    getAgentTurnEvidence: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                turnId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description getAgentTurnEvidence */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        schemaVersion: "hengzhun-cli-evidence-view/v1";
                        journeyId: string;
                        version: number;
                        status: string;
                        terminal: boolean;
                        references: {
                            caseId?: string;
                            preparationId?: string;
                            candidateId?: string;
                            certificateId?: string;
                            scriptId?: string;
                            scriptHash?: string;
                            planId?: string;
                            confirmedDecisionEventId?: string;
                            taskId?: string;
                            runId?: string;
                            scheduleId?: string;
                            inboxId?: string;
                            resultArtifactId?: string;
                        };
                        artifactCards: {
                            artifactId: string;
                            displayName: string;
                            mediaType?: string;
                            sha256?: string;
                            size?: number;
                            downloadGrantRequired: boolean;
                        }[];
                    };
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
    downloadAgentArtifact: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                turnId: string;
                artifactId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Download only an artifact in the turn Journey evidence. Internal one-time grant and service tokens never reach the browser. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            400: components["responses"]["Problem"];
            403: components["responses"]["Problem"];
            404: components["responses"]["Problem"];
            409: components["responses"]["Problem"];
            413: components["responses"]["Problem"];
            415: components["responses"]["Problem"];
            500: components["responses"]["Problem"];
            503: components["responses"]["Problem"];
        };
    };
}

export const agentOperations = {
  "getAgentBootstrap": {
    "method": "GET",
    "path": "/api/agent/v1/bootstrap"
  },
  "listAgentConversations": {
    "method": "GET",
    "path": "/api/agent/v1/conversations"
  },
  "createAgentConversation": {
    "method": "POST",
    "path": "/api/agent/v1/conversations"
  },
  "getAgentConversation": {
    "method": "GET",
    "path": "/api/agent/v1/conversations/{conversationId}"
  },
  "submitAgentMessage": {
    "method": "POST",
    "path": "/api/agent/v1/conversations/{conversationId}/messages"
  },
  "getAgentTurn": {
    "method": "GET",
    "path": "/api/agent/v1/turns/{turnId}"
  },
  "cancelAgentTurn": {
    "method": "POST",
    "path": "/api/agent/v1/turns/{turnId}/cancel"
  },
  "listAgentModels": {
    "method": "GET",
    "path": "/api/agent/v1/models"
  },
  "createAgentModel": {
    "method": "POST",
    "path": "/api/agent/v1/models"
  },
  "updateAgentModel": {
    "method": "PUT",
    "path": "/api/agent/v1/models/{modelId}"
  },
  "checkAgentModel": {
    "method": "POST",
    "path": "/api/agent/v1/models/check"
  },
  "setDefaultAgentModel": {
    "method": "PUT",
    "path": "/api/agent/v1/models/{modelId}/default"
  },
  "importAgentAttachment": {
    "method": "POST",
    "path": "/api/agent/v1/attachments"
  },
  "getAgentTurnEvidence": {
    "method": "GET",
    "path": "/api/agent/v1/turns/{turnId}/evidence"
  },
  "downloadAgentArtifact": {
    "method": "GET",
    "path": "/api/agent/v1/turns/{turnId}/artifacts/{artifactId}"
  }
} as const;
