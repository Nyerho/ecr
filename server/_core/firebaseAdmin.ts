import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { ENV } from "./env";

const firebaseApp =
    getApps().length > 0
        ? getApps()[0]
        : initializeApp({
        credential: cert({
            projectId: ENV.firebaseProjectId,
            clientEmail: ENV.firebaseClientEmail,
            privateKey: ENV.firebasePrivateKey.replace(/\\n/g, "\n"),
        }),
    });

export const firestore = getFirestore(firebaseApp);
export { firebaseApp };