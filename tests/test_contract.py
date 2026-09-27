import importlib.util
import json
import sys
import types
from pathlib import Path

import pytest


class UserError(Exception):
    pass


class Return:
    def __init__(self, calldata):
        self.calldata = calldata


class Public:
    write = staticmethod(lambda fn: fn)
    view = staticmethod(lambda fn: fn)


class Message:
    sender_address = "0x" + "1" * 40


class Nondet:
    def __init__(self):
        self.answer = {"v": 1, "labels": ["EQUIVALENT"]}

    def exec_prompt(self, _prompt, response_format=None):
        assert response_format == "json"
        return self.answer


class VM:
    Return = Return
    UserError = UserError

    @staticmethod
    def run_nondet(leader, validator):
        proposed = leader()
        assert validator(Return(proposed))
        return proposed


def load_contract():
    module = types.ModuleType("genlayer")
    module.u256 = int
    module.Address = str
    module.storage = types.SimpleNamespace(TreeMap=dict)
    module.contract = types.SimpleNamespace(Contract=object)
    module.public = Public()
    module.message = Message()
    module.nondet = Nondet()
    module.vm = VM()
    module.gl = module
    sys.modules["genlayer"] = module
    path = Path(__file__).parents[1] / "contracts" / "main.py"
    spec = importlib.util.spec_from_file_location("contract_under_test", path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    contract = loaded.NegotiatedTermsCommonGroundRegister()
    for name in (
        "cases",
        "nonce_index",
        "actor_index",
        "child_index",
        "version_index",
        "history",
    ):
        setattr(contract, name, {})
    return loaded, contract


@pytest.fixture
def subject():
    return load_contract()


def set_sender(module, value):
    module.gl.message.sender_address = value


def offer(**terms):
    return json.dumps({"terms": [{"key": key, "text": text} for key, text in terms.items()]})


def record(contract, case_id=1):
    return json.loads(contract.get_case(case_id))


def create_pair(module, contract):
    party_b = "0x" + "2" * 40
    case_id = contract.create_negotiation("a" * 32, party_b, 0)
    return case_id, party_b


def freeze_pair(module, contract, a_offer, b_offer):
    case_id, party_b = create_pair(module, contract)
    contract.put_offer_a(case_id, a_offer, 1)
    set_sender(module, party_b)
    contract.put_offer_b(case_id, b_offer, 2)
    set_sender(module, "0x" + "1" * 40)
    contract.freeze_offer_a(case_id, 3)
    set_sender(module, party_b)
    contract.freeze_offer_b(case_id, 4)
    return case_id


def test_create_is_identity_only_and_idempotent(subject):
    module, contract = subject
    case_id, party_b = create_pair(module, contract)
    first = record(contract)
    assert case_id == 1
    assert first["phase"] == "OPEN"
    assert first["base"] == first["response"] == {}
    assert contract.create_negotiation("a" * 32, party_b, 0) == 1
    assert record(contract)["revision"] == "1"


def test_parties_cannot_write_or_freeze_each_others_offer(subject):
    module, contract = subject
    case_id, party_b = create_pair(module, contract)
    before = contract.get_case(case_id)
    with pytest.raises(UserError, match="FORBIDDEN"):
        contract.put_offer_b(case_id, offer(price="10 GEN"), 1)
    assert contract.get_case(case_id) == before
    set_sender(module, party_b)
    with pytest.raises(UserError, match="FORBIDDEN"):
        contract.put_offer_a(case_id, offer(price="10 GEN"), 1)
    assert contract.get_case(case_id) == before


def test_offer_boundary_rejects_duplicates_controls_and_unknown_keys(subject):
    module, contract = subject
    case_id, _ = create_pair(module, contract)
    bad = '{"terms":[{"key":"price","text":"x"},{"key":"price","text":"y"}]}'
    with pytest.raises(UserError, match="BAD_OFFER"):
        contract.put_offer_a(case_id, bad, 1)
    with pytest.raises(UserError, match="BAD_OFFER"):
        contract.put_offer_a(case_id, '{"terms":[{"key":"price","text":"x\\u0001"}]}', 1)
    with pytest.raises(UserError, match="BAD_OFFER"):
        contract.put_offer_a(case_id, '{"terms":[],"extra":1}', 1)


def test_both_freeze_orders_reach_frozen(subject):
    module, contract = subject
    case_id, party_b = create_pair(module, contract)
    contract.put_offer_a(case_id, offer(price="10 GEN"), 1)
    set_sender(module, party_b)
    contract.put_offer_b(case_id, offer(price="10 GEN"), 2)
    contract.freeze_offer_b(case_id, 3)
    set_sender(module, "0x" + "1" * 40)
    contract.freeze_offer_a(case_id, 4)
    assert record(contract)["phase"] == "FROZEN"


def test_no_shared_keys_skips_nondeterminism_and_commits_no_common_ground(subject):
    module, contract = subject
    case_id = freeze_pair(module, contract, offer(price="10 GEN"), offer(term="30 days"))

    def forbidden(*_args, **_kwargs):
        raise AssertionError("nondeterminism must be skipped")

    module.gl.nondet.exec_prompt = forbidden
    contract.evaluate_common_ground(case_id, 5)
    result = record(contract)
    assert result["phase"] == "DONE"
    assert result["outcome"] == "NO_COMMON_GROUND"
    assert result["result"] == {"v": 1, "labels": []}


@pytest.mark.parametrize(
    "labels,outcome",
    [
        (["EQUIVALENT", "EQUIVALENT"], "FULL_COMMON_GROUND"),
        (["EQUIVALENT", "DIFFERENT"], "PARTIAL_COMMON_GROUND"),
        (["DIFFERENT", "DIFFERENT"], "NO_COMMON_GROUND"),
    ],
)
def test_conclusive_reducer(subject, labels, outcome):
    module, contract = subject
    case_id = freeze_pair(
        module,
        contract,
        offer(price="10 GEN", term="30 days"),
        offer(price="10 GEN", term="30 days"),
    )
    module.gl.nondet.answer = {"v": 1, "labels": labels}
    contract.evaluate_common_ground(case_id, 5)
    assert record(contract)["outcome"] == outcome


def test_unknown_is_unresolved_and_history_binds_operation(subject):
    module, contract = subject
    case_id = freeze_pair(module, contract, offer(price="about ten"), offer(price="10 GEN"))
    module.gl.nondet.answer = {"v": 1, "labels": ["UNKNOWN"]}
    contract.evaluate_common_ground(case_id, 5)
    current = record(contract)
    historical = json.loads(contract.get_version(case_id, 6))
    assert current["phase"] == "UNRESOLVED"
    assert historical["last_operation"]["method"] == "evaluate_common_ground"
    assert historical["last_operation"]["caller"] == "0x" + "2" * 40


def test_stale_revision_and_malformed_result_leave_state_unchanged(subject):
    module, contract = subject
    case_id = freeze_pair(module, contract, offer(price="10"), offer(price="10"))
    before = contract.get_case(case_id)
    with pytest.raises(UserError, match="STALE_REVISION"):
        contract.evaluate_common_ground(case_id, 4)
    assert contract.get_case(case_id) == before
    module.gl.nondet.answer = {"v": 1, "labels": ["EQUIVALENT"], "reason": "invented"}
    with pytest.raises(UserError, match="BAD_RESULT"):
        contract.evaluate_common_ground(case_id, 5)
    assert contract.get_case(case_id) == before


def test_pagination_bounds_and_actor_index(subject):
    module, contract = subject
    _, party_b = create_pair(module, contract)
    assert json.loads(contract.list_actor(party_b, 0, 4))["ids"] == ["1"]
    assert json.loads(contract.list_cases(1, 4))["ids"] == ["1"]
    with pytest.raises(UserError, match="BAD_PAGE"):
        contract.list_cases(0, 4)


def test_bool_is_not_an_integer_at_protocol_boundaries(subject):
    module, contract = subject
    _, party_b = create_pair(module, contract)
    with pytest.raises(UserError, match="BAD_INTEGER"):
        contract.create_negotiation("b" * 32, party_b, True)
