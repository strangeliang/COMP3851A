const { StudyError } = require("../services/studyContracts");

const authenticationError = () => new StudyError(
  401,
  "TEST_USER_REQUIRED",
  "Provide a valid x-user-id header for an existing user.",
);

function createTestCurrentUser({ database }) {
  return async function testCurrentUser(req, _res, next) {
    const header = req.get("x-user-id");
    if (typeof header !== "string" || !/^[1-9]\d*$/.test(header)) {
      throw authenticationError();
    }

    const userId = Number(header);
    if (!Number.isSafeInteger(userId)) throw authenticationError();

    const user = await database.getUserById(userId);
    if (!user) throw authenticationError();

    // A future login/session authentication layer should set req.currentUser here instead.
    req.currentUser = { id: user.id };
    next();
  };
}

module.exports = { createTestCurrentUser };
