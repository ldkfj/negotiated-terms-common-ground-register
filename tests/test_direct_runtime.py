def test_current_runtime_storage_and_public_abi(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy("contracts/main.py")
    import genlayer as gl

    direct_vm.sender = direct_alice
    case_id = contract.create_negotiation("a" * 32, gl.Address(direct_bob), 0)
    assert int(case_id) == 1
    assert '"phase":"OPEN"' in contract.get_case(case_id)


def test_current_runtime_nondet_serialization_and_validator(
    direct_vm, direct_deploy, direct_alice, direct_bob, monkeypatch
):
    contract = direct_deploy("contracts/main.py")
    import genlayer as gl
    import gltest.direct.wasi_mock as wasi_mock

    # gltest 0.30.0rc2 auto-decodes mocked JSON into a dict, while the current
    # SDK JSON response decoder expects the host result to remain text.
    def raw_json_mock(vm, data):
        response = vm._match_llm_mock(data.get("prompt", ""))
        if response is None:
            raise wasi_mock.MockNotFoundError("No LLM mock matched the prompt")
        return {"ok": response}

    monkeypatch.setattr(wasi_mock, "_handle_llm_request", raw_json_mock)

    alice = gl.Address(direct_alice)
    bob = gl.Address(direct_bob)
    offer = '{"terms":[{"key":"price","text":"100 GEN"}]}'
    direct_vm.sender = direct_alice
    case_id = contract.create_negotiation("b" * 32, bob, 0)
    contract.put_offer_a(case_id, offer, 1)
    contract.freeze_offer_a(case_id, 2)
    direct_vm.sender = direct_bob
    contract.put_offer_b(case_id, offer, 3)
    contract.freeze_offer_b(case_id, 4)
    direct_vm.mock_llm(".*", '{"v":1,"labels":["EQUIVALENT"]}')
    contract.evaluate_common_ground(case_id, 5)
    assert '"outcome":"FULL_COMMON_GROUND"' in contract.get_case(case_id)
    assert direct_vm.run_validator()
